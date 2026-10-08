import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import {
  applyTenantContext,
  Prisma,
  Vertical,
  prisma,
  runTransaction,
  withOrgRlsContext,
} from "@pathway/db";
import {
  EFFECTIVE_PERMISSIONS_CONTEXT,
  FEATURE_AVAILABILITY_READER,
  EffectivePermissionsService,
  type EffectivePermissionsContext,
} from "../effective-permissions.service";
import { AccessControlModule } from "../access-control.module";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const NOW = new Date("2026-07-28T12:00:00.000Z");
const CI_RLS_ROLE = "pathway_e2e_rls";

function getRlsRoleName(): string | undefined {
  const configuredRole = process.env.E2E_RLS_ROLE;
  if (!configuredRole) return undefined;
  if (
    configuredRole !== CI_RLS_ROLE ||
    !/^[a-z_][a-z0-9_]*$/.test(configuredRole)
  ) {
    throw new Error(`Unexpected E2E RLS role: ${configuredRole}`);
  }
  return configuredRole;
}

async function withRoleRlsOrgContext<T>(
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const roleName = getRlsRoleName();
  return withOrgRlsContext(orgId, async (tx) => {
    if (roleName) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${roleName}"`);
      const roleAttributes = await tx.$queryRaw<
        Array<{ currentUser: string; rolsuper: boolean; rolbypassrls: boolean }>
      >`
        SELECT current_user AS "currentUser", rolsuper, rolbypassrls
        FROM pg_roles
        WHERE rolname = current_user
      `;
      expect(roleAttributes).toEqual([
        {
          currentUser: CI_RLS_ROLE,
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
    }
    return callback(tx);
  });
}

const effectivePermissionsContext: EffectivePermissionsContext = {
  async run(orgId, tenantId, operation) {
    return tenantId === undefined
      ? withRoleRlsOrgContext(orgId, async () => operation())
      : operation();
  },
};

const rlsRoleIsConfigured = process.env.E2E_RLS_ROLE === CI_RLS_ROLE;

async function expectReadOnlyRejection(
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    expect(error).toMatchObject({
      code: "P2010",
      meta: { code: "25006" },
    });
    return;
  }

  throw new Error("Expected the read-only transaction to reject the write");
}

describe("effective permission RLS resolution", () => {
  const fixture = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    allowedUser: randomUUID(),
    crossOrgUser: randomUUID(),
    superUser: randomUUID(),
    orgARole: randomUUID(),
    orgBRole: randomUUID(),
    siteA: randomUUID(),
    siteB: randomUUID(),
    siteRole: randomUUID(),
  };
  let service: EffectivePermissionsService | undefined;
  let moduleRef: TestingModule | undefined;
  let transactionalService: EffectivePermissionsService | undefined;
  let transactionalModuleRef: TestingModule | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgA,
          name: "Effective permission org A",
          slug: `effective-permission-a-${fixture.orgA}`,
          planCode: "trial",
        },
        {
          id: fixture.orgB,
          name: "Effective permission org B",
          slug: `effective-permission-b-${fixture.orgB}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        {
          id: fixture.allowedUser,
          email: `${fixture.allowedUser}@example.test`,
        },
        {
          id: fixture.crossOrgUser,
          email: `${fixture.crossOrgUser}@example.test`,
        },
        {
          id: fixture.superUser,
          email: `${fixture.superUser}@example.test`,
          superUser: true,
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.siteA,
          orgId: fixture.orgA,
          name: "Effective permission site A",
          slug: `effective-permission-site-a-${fixture.siteA}`,
        },
        {
          id: fixture.siteB,
          orgId: fixture.orgA,
          name: "Effective permission site B",
          slug: `effective-permission-site-b-${fixture.siteB}`,
        },
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: fixture.orgA, userId: fixture.allowedUser },
        { orgId: fixture.orgA, userId: fixture.crossOrgUser },
        { orgId: fixture.orgB, userId: fixture.crossOrgUser },
        { orgId: fixture.orgA, userId: fixture.superUser },
      ],
    });
    await prisma.siteMembership.create({
      data: { tenantId: fixture.siteA, userId: fixture.allowedUser },
    });
    await prisma.siteMembership.create({
      data: { tenantId: fixture.siteA, userId: fixture.superUser },
    });
    await prisma.orgVertical.createMany({
      data: [
        { orgId: fixture.orgA, vertical: Vertical.ACE_SCHOOL },
        { orgId: fixture.orgB, vertical: Vertical.ACE_SCHOOL },
      ],
    });
    await prisma.orgRoleDefinition.createMany({
      data: [
        {
          id: fixture.orgARole,
          orgId: fixture.orgA,
          name: `Effective permission role A ${fixture.orgARole}`,
          scope: "organisation",
          createdById: fixture.allowedUser,
          updatedById: fixture.allowedUser,
        },
        {
          id: fixture.orgBRole,
          orgId: fixture.orgB,
          name: `Effective permission role B ${fixture.orgBRole}`,
          scope: "organisation",
          createdById: fixture.crossOrgUser,
          updatedById: fixture.crossOrgUser,
        },
        {
          id: fixture.siteRole,
          orgId: fixture.orgA,
          tenantId: fixture.siteA,
          name: `Effective permission site role ${fixture.siteRole}`,
          scope: "site",
          createdById: fixture.allowedUser,
          updatedById: fixture.allowedUser,
        },
      ],
    });
    await prisma.orgRolePermission.createMany({
      data: [
        {
          roleDefinitionId: fixture.orgARole,
          permissionKey: "ace.pace.read",
          grantedById: fixture.allowedUser,
        },
        {
          roleDefinitionId: fixture.orgBRole,
          permissionKey: "ace.pace.read",
          grantedById: fixture.crossOrgUser,
        },
        {
          roleDefinitionId: fixture.siteRole,
          permissionKey: "attendance.manage",
          grantedById: fixture.allowedUser,
        },
      ],
    });
    await prisma.userRoleAssignment.createMany({
      data: [
        {
          orgId: fixture.orgA,
          userId: fixture.allowedUser,
          roleDefinitionId: fixture.orgARole,
          assignedById: fixture.allowedUser,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          orgId: fixture.orgB,
          userId: fixture.crossOrgUser,
          roleDefinitionId: fixture.orgBRole,
          assignedById: fixture.crossOrgUser,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        },
        {
          orgId: fixture.orgA,
          tenantId: fixture.siteA,
          userId: fixture.allowedUser,
          roleDefinitionId: fixture.siteRole,
          assignedById: fixture.allowedUser,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        },
      ],
    });

    moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    })
      .overrideProvider(FEATURE_AVAILABILITY_READER)
      .useValue({ isAvailable: async () => true })
      .overrideProvider(EFFECTIVE_PERMISSIONS_CONTEXT)
      .useValue(effectivePermissionsContext)
      .compile();
    service = moduleRef.get(EffectivePermissionsService);

    transactionalModuleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    }).compile();
    transactionalService = transactionalModuleRef.get(
      EffectivePermissionsService,
    );
  });

  afterAll(async () => {
    if (isDatabaseAvailable()) {
      await prisma.userRoleAssignment.deleteMany({
        where: {
          roleDefinitionId: {
            in: [fixture.orgARole, fixture.orgBRole, fixture.siteRole],
          },
        },
      });
      await prisma.orgRolePermission.deleteMany({
        where: {
          roleDefinitionId: {
            in: [fixture.orgARole, fixture.orgBRole, fixture.siteRole],
          },
        },
      });
      await prisma.orgRoleDefinition.deleteMany({
        where: {
          id: { in: [fixture.orgARole, fixture.orgBRole, fixture.siteRole] },
        },
      });
      await prisma.orgVertical.deleteMany({
        where: { orgId: { in: [fixture.orgA, fixture.orgB] } },
      });
      await prisma.siteMembership.deleteMany({
        where: { tenantId: { in: [fixture.siteA, fixture.siteB] } },
      });
      await prisma.orgMembership.deleteMany({
        where: {
          userId: {
            in: [fixture.allowedUser, fixture.crossOrgUser, fixture.superUser],
          },
        },
      });
      await prisma.tenant.deleteMany({
        where: { id: { in: [fixture.siteA, fixture.siteB] } },
      });
      await prisma.user.deleteMany({
        where: {
          id: {
            in: [fixture.allowedUser, fixture.crossOrgUser, fixture.superUser],
          },
        },
      });
      await prisma.org.deleteMany({
        where: { id: { in: [fixture.orgA, fixture.orgB] } },
      });
    }
    await moduleRef?.close();
    await transactionalModuleRef?.close();
  });

  it("exposes the requested organisation membership in an org RLS context", async () => {
    const memberships = await withRoleRlsOrgContext(fixture.orgA, (tx) =>
      tx.orgMembership.findMany({
        where: { orgId: fixture.orgA, userId: fixture.allowedUser },
        select: { id: true },
      }),
    );

    expect(memberships).toHaveLength(1);
  });

  it("permits organisation-context reads but rejects attempted writes", async () => {
    const visibleRoleIds = await withOrgRlsContext(fixture.orgA, (tx) =>
      tx.orgRoleDefinition.findMany({
        where: { id: fixture.orgARole },
        select: { id: true },
      }),
    );

    expect(visibleRoleIds).toEqual([{ id: fixture.orgARole }]);
    await expectReadOnlyRejection(() =>
      withOrgRlsContext(fixture.orgA, async (tx) => {
        return tx.$executeRaw`
          UPDATE "OrgRoleDefinition"
          SET "name" = "name"
          WHERE "id" = ${fixture.orgARole}
        `;
      }),
    );
  });

  it("allows a valid organisation role without a selected tenant", async () => {
    if (!service) return;

    await expect(
      service.resolve({
        userId: fixture.allowedUser,
        orgId: fixture.orgA,
        permission: "ace.pace.read",
        now: NOW,
      }),
    ).resolves.toEqual({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: [fixture.orgARole],
    });
  });

  it("reads uncommitted retirement changes instead of a cached assignment", async () => {
    const cutoverService = transactionalService;
    if (!cutoverService) return;
    await expect(
      cutoverService.listForUserWithSources(
        fixture.allowedUser,
        fixture.orgA,
        undefined,
        NOW,
      ),
    ).resolves.toEqual([
      { permissionKey: "ace.pace.read", sourceRoleIds: [fixture.orgARole] },
    ]);

    const rollback = new Error("roll back transaction-aware access test");
    await expect(
      runTransaction(async (tx) => {
        if (rlsRoleIsConfigured) {
          await tx.$executeRawUnsafe(`SET LOCAL ROLE "${CI_RLS_ROLE}"`);
          await tx.$executeRawUnsafe(
            "SELECT set_config('app.assignment_org_read', 'on', true)",
          );
        }
        await applyTenantContext(tx, "", fixture.orgA);
        const before = await cutoverService.listForUserWithSourcesInTransaction(
          fixture.allowedUser,
          fixture.orgA,
          undefined,
          NOW,
          tx,
          true,
        );
        expect(before).toHaveLength(1);

        await tx.userRoleAssignment.updateMany({
          where: {
            orgId: fixture.orgA,
            userId: fixture.allowedUser,
            roleDefinitionId: fixture.orgARole,
            revokedAt: null,
          },
          data: { revokedAt: NOW, revokedById: fixture.allowedUser },
        });
        const after = await cutoverService.listForUserWithSourcesInTransaction(
          fixture.allowedUser,
          fixture.orgA,
          undefined,
          NOW,
          tx,
          true,
        );
        expect(after).toEqual([]);
        throw rollback;
      }),
    ).rejects.toBe(rollback);

    await expect(
      prisma.userRoleAssignment.findFirst({
        where: {
          orgId: fixture.orgA,
          userId: fixture.allowedUser,
          roleDefinitionId: fixture.orgARole,
        },
        select: { revokedAt: true },
      }),
    ).resolves.toEqual({ revokedAt: null });
  });

  it("switches site RLS context between transaction-aware reads", async () => {
    const cutoverService = transactionalService;
    if (!cutoverService) return;

    await runTransaction(async (tx) => {
      if (rlsRoleIsConfigured) {
        await tx.$executeRawUnsafe(`SET LOCAL ROLE "${CI_RLS_ROLE}"`);
        await tx.$executeRawUnsafe(
          "SELECT set_config('app.assignment_org_read', 'on', true)",
        );
      }
      const siteA = await cutoverService.listForUserWithSourcesInTransaction(
        fixture.allowedUser,
        fixture.orgA,
        fixture.siteA,
        NOW,
        tx,
        true,
      );
      const siteB = await cutoverService.listForUserWithSourcesInTransaction(
        fixture.allowedUser,
        fixture.orgA,
        fixture.siteB,
        NOW,
        tx,
        true,
      );
      expect(siteA.map(({ permissionKey }) => permissionKey)).toEqual([
        "ace.pace.read",
        "attendance.manage",
      ]);
      expect(siteB.map(({ permissionKey }) => permissionKey)).toEqual([
        "ace.pace.read",
      ]);
    });
  });

  it("does not expose another organisation's role when resolving org-only access", async () => {
    if (!service) return;

    await expect(
      service.resolve({
        userId: fixture.crossOrgUser,
        orgId: fixture.orgA,
        permission: "ace.pace.read",
        now: NOW,
      }),
    ).resolves.toEqual({
      allowed: false,
      reason: "permission-missing",
      sourceRoleIds: [],
    });
  });

  it("grants an admitted superuser without an assignment but rejects other scopes", async () => {
    if (!service) return;
    const request = {
      userId: fixture.superUser,
      orgId: fixture.orgA,
      tenantId: fixture.siteA,
      permission: "ace.pace.read" as const,
      now: NOW,
    };

    await expect(service.resolve(request)).resolves.toEqual({
      allowed: true,
      reason: "allowed",
      sourceRoleIds: [],
      sourceSuperUser: true,
    });
    await expect(
      service.resolve({ ...request, tenantId: undefined }),
    ).resolves.toMatchObject({ allowed: true, sourceSuperUser: true });
    await expect(
      service.resolve({ ...request, tenantId: fixture.siteB }),
    ).resolves.toMatchObject({
      allowed: false,
    });
    await expect(
      service.resolve({ ...request, orgId: fixture.orgB }),
    ).resolves.toMatchObject({
      allowed: false,
      reason: "no-membership",
    });
  });

  (rlsRoleIsConfigured ? it : it.skip)(
    "restricts organisation-only RLS reads to the requested organisation",
    async () => {
      const visibleRoleIds = await withRoleRlsOrgContext(fixture.orgA, (tx) =>
        tx.orgRoleDefinition.findMany({
          where: { id: { in: [fixture.orgARole, fixture.orgBRole] } },
          select: { id: true },
        }),
      );

      expect(visibleRoleIds).toEqual([{ id: fixture.orgARole }]);
    },
  );
});
