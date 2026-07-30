import { randomUUID } from "node:crypto";
import {
  prisma,
  runTransaction,
} from "@pathway/db";
import {
  createRolesTransactionBoundary,
  RolesService,
  type RoleActorContext,
} from "../roles.service";
import { AccessCacheService } from "../access-cache.service";
import {
  RoleSafetyService,
  type RoleMutationCommand,
} from "../role-safety.service";
import { isDatabaseAvailable, requireDatabase } from "../../../test-helpers.e2e";

const RLS_ROLE = "pathway_e2e_rls";
const AUDIT_DENIED_ROLE = "pathway_e2e_audit_denied";
const passThroughRoleSafety = {
  async assertHeadAndSelfLockoutSafe(
    command: RoleMutationCommand,
  ): Promise<void> {
    await command.mutate();
  },
} as RoleSafetyService;

function testTransactionBoundary(roleName = RLS_ROLE) {
  return createRolesTransactionBoundary(async (operation) =>
    runTransaction(async (tx) => {
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
          currentUser: roleName,
          rolsuper: false,
          rolbypassrls: false,
        },
      ]);
      return operation(tx);
    }),
  );
}

async function expectMissing(operation: () => Promise<unknown>): Promise<void> {
  await expect(operation()).rejects.toMatchObject({
    response: { statusCode: 404, code: "ROLE_NOT_FOUND" },
  });
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2010"
    ) {
      expect(error).toMatchObject({ meta: { code: postgresCode } });
    } else {
      expect(error).toMatchObject({
        message: expect.stringContaining(
          `PostgresError { code: "${postgresCode}"`,
        ),
      });
    }
    return;
  }

  throw new Error("Expected the database operation to be rejected");
}

describe("role API transaction and forced-RLS integration", () => {
  const userA = randomUUID();
  const userB = randomUUID();
  const orgA = randomUUID();
  const orgB = randomUUID();
  const siteA = randomUUID();
  const siteA2 = randomUUID();
  const siteB = randomUUID();
  const actorA: RoleActorContext = {
    orgId: orgA,
    tenantId: siteA,
    userId: userA,
    legacyOrgRoles: ["org:admin"],
    requestId: "role-api-transaction-rls",
  };
  let actorB: RoleActorContext;
  let service: RolesService;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.user.createMany({
      data: [
        { id: userA, email: `${userA}@example.test` },
        { id: userB, email: `${userB}@example.test` },
      ],
    });
    await prisma.org.createMany({
      data: [
        {
          id: orgA,
          name: `Role API org ${orgA}`,
          slug: `role-api-${orgA}`,
          planCode: "trial",
        },
        {
          id: orgB,
          name: `Role API org ${orgB}`,
          slug: `role-api-${orgB}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: siteA,
          name: "Role API site A",
          slug: `role-api-site-${siteA}`,
          orgId: orgA,
        },
        {
          id: siteA2,
          name: "Role API site A2",
          slug: `role-api-site-${siteA2}`,
          orgId: orgA,
        },
        {
          id: siteB,
          name: "Role API site B",
          slug: `role-api-site-${siteB}`,
          orgId: orgB,
        },
      ],
    });
    await prisma.orgMembership.create({
      data: { orgId: orgA, userId: userA, role: "ORG_ADMIN" },
    });
    await prisma.orgMembership.create({
      data: { orgId: orgB, userId: userB, role: "ORG_ADMIN" },
    });
    await prisma.orgVertical.createMany({
      data: [
        { orgId: orgA, vertical: "ACE_SCHOOL" },
        { orgId: orgB, vertical: "ACE_SCHOOL" },
      ],
    });
    actorB = { ...actorA, orgId: orgB, tenantId: siteB, userId: userB };
    service = new RolesService(
      testTransactionBoundary(),
      new AccessCacheService(),
      passThroughRoleSafety,
    );
  });

  it("commits every role mutation with its revision and audit event under the non-bypass role", async () => {
    if (!isDatabaseAvailable()) return;

    const created = await service.create({
      name: `Transactional role ${randomUUID()}`,
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, actorA);
    const cloned = await service.clone(created.id, { name: `Transactional clone ${randomUUID()}` }, actorA);
    const updated = await service.update({
      roleId: created.id,
      expectedVersion: created.version,
      name: `${created.name} updated`,
      permissionKeys: ["ace.pace.read"],
    }, actorA);
    await service.retire(cloned.id, { expectedVersion: cloned.version }, actorA);

    await testTransactionBoundary().run(actorA, async (tx) => {
      const [revisions, audits] = await Promise.all([
        tx.orgRoleRevision.findMany({ where: { roleDefinitionId: { in: [created.id, cloned.id] } } }),
        tx.auditEvent.findMany({ where: { entityId: { in: [created.id, cloned.id] } } }),
      ]);
      expect(updated.version).toBe(2);
      expect(revisions).toHaveLength(4);
      expect(audits).toHaveLength(4);
      expect(
        audits.every(
          (audit) => audit.orgId === orgA && audit.tenantId === siteA,
        ),
      ).toBe(true);
      expect(
        audits.every(
          (audit) =>
            typeof audit.metadata === "object" &&
            audit.metadata !== null &&
            "requestId" in audit.metadata &&
            audit.metadata.requestId === actorA.requestId,
        ),
      ).toBe(true);
    });
  });

  it("rolls back the role mutation when the audit write is denied", async () => {
    if (!isDatabaseAvailable()) return;

    const name = `Audit rollback ${randomUUID()}`;
    const before = await testTransactionBoundary().run(actorA, async (tx) => ({
      roles: await tx.orgRoleDefinition.count({ where: { name } }),
      revisions: await tx.orgRoleRevision.count({ where: { actorUserId: userA } }),
      audits: await tx.auditEvent.count({ where: { actorUserId: userA, action: "ROLE_CREATED" } }),
    }));
    const deniedService = new RolesService(
      testTransactionBoundary(AUDIT_DENIED_ROLE),
      new AccessCacheService(),
      passThroughRoleSafety,
    );
    await expectDatabaseRejection(
      () =>
        deniedService.create(
          { name, scope: "site", permissionKeys: ["ace.pace.read"] },
          actorA,
        ),
      "42501",
    );
    await testTransactionBoundary().run(actorA, async (tx) => {
      expect(await tx.orgRoleDefinition.findFirst({ where: { name } })).toBeNull();
      await expect(Promise.all([
        tx.orgRoleDefinition.count({ where: { name } }),
        tx.orgRoleRevision.count({ where: { actorUserId: userA } }),
        tx.auditEvent.count({ where: { actorUserId: userA, action: "ROLE_CREATED" } }),
      ])).resolves.toEqual([before.roles, before.revisions, before.audits]);
    });
  });

  it("records organisation-scoped audit rows with no tenant and isolates them by organisation", async () => {
    if (!isDatabaseAvailable()) return;

    const organisationActor = { ...actorA, tenantId: undefined };
    const role = await service.create({
      name: `Organisation audit ${randomUUID()}`,
      scope: "organisation",
      permissionKeys: ["ace.pace.read"],
    }, organisationActor);

    await testTransactionBoundary().run(organisationActor, async (tx) => {
      await expect(tx.auditEvent.findFirst({ where: { entityId: role.id } })).resolves.toMatchObject({
        orgId: orgA,
        tenantId: null,
      });
    });
    await testTransactionBoundary().run({ ...actorA, tenantId: siteA2 }, async (tx) => {
      await expect(tx.auditEvent.findFirst({ where: { entityId: role.id } })).resolves.toMatchObject({
        orgId: orgA,
        tenantId: null,
      });
    });
    await testTransactionBoundary().run(actorB, async (tx) => {
      await expect(tx.auditEvent.findFirst({ where: { entityId: role.id } })).resolves.toBeNull();
    });
  });

  it("denies cross-site and cross-organisation role reads through the real service", async () => {
    if (!isDatabaseAvailable()) return;

    const role = await service.create({
      name: `Isolation role ${randomUUID()}`,
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, actorA);
    await expectMissing(() =>
      service.get(role.id, { ...actorA, tenantId: siteA2 }),
    );
    await expectMissing(() => service.get(role.id, actorB));
  });

  it("rejects direct revision updates and deletes after RLS has admitted the row", async () => {
    if (!isDatabaseAvailable()) return;

    const role = await service.create({
      name: `Immutable revision ${randomUUID()}`,
      scope: "site",
      permissionKeys: ["ace.pace.read"],
    }, actorA);
    const revision = await testTransactionBoundary().run(actorA, (tx) =>
      tx.orgRoleRevision.findFirstOrThrow({ where: { roleDefinitionId: role.id } }),
    );

    await expectDatabaseRejection(
      () =>
        testTransactionBoundary().run(actorA, (tx) =>
          tx.$executeRaw`
            UPDATE "OrgRoleRevision"
            SET "name" = 'blocked'
            WHERE "id" = ${revision.id}
          `,
        ),
      "P0001",
    );
    await expectDatabaseRejection(
      () =>
        testTransactionBoundary().run(actorA, (tx) =>
          tx.$executeRaw`
            DELETE FROM "OrgRoleRevision"
            WHERE "id" = ${revision.id}
          `,
        ),
      "P0001",
    );
  });
});
