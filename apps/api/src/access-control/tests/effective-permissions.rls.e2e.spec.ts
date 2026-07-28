import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { Prisma, Vertical, prisma, withOrgRlsContext } from "@pathway/db";
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

describe("effective permission RLS resolution", () => {
  const fixture = {
    orgA: randomUUID(),
    orgB: randomUUID(),
    allowedUser: randomUUID(),
    crossOrgUser: randomUUID(),
    orgARole: randomUUID(),
    orgBRole: randomUUID(),
  };
  let service: EffectivePermissionsService | undefined;
  let moduleRef: TestingModule | undefined;

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
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: fixture.orgA, userId: fixture.allowedUser },
        { orgId: fixture.orgA, userId: fixture.crossOrgUser },
        { orgId: fixture.orgB, userId: fixture.crossOrgUser },
      ],
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
  });

  afterAll(async () => {
    if (isDatabaseAvailable()) {
      await prisma.userRoleAssignment.deleteMany({
        where: {
          roleDefinitionId: { in: [fixture.orgARole, fixture.orgBRole] },
        },
      });
      await prisma.orgRolePermission.deleteMany({
        where: {
          roleDefinitionId: { in: [fixture.orgARole, fixture.orgBRole] },
        },
      });
      await prisma.orgRoleDefinition.deleteMany({
        where: { id: { in: [fixture.orgARole, fixture.orgBRole] } },
      });
      await prisma.orgVertical.deleteMany({
        where: { orgId: { in: [fixture.orgA, fixture.orgB] } },
      });
      await prisma.orgMembership.deleteMany({
        where: { userId: { in: [fixture.allowedUser, fixture.crossOrgUser] } },
      });
      await prisma.user.deleteMany({
        where: { id: { in: [fixture.allowedUser, fixture.crossOrgUser] } },
      });
      await prisma.org.deleteMany({
        where: { id: { in: [fixture.orgA, fixture.orgB] } },
      });
    }
    await moduleRef?.close();
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
