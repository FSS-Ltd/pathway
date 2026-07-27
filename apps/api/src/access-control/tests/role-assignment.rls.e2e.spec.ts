import { randomUUID } from "node:crypto";
import {
  Prisma,
  prisma,
  withTenantRlsContext,
  type PrismaClientType,
} from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_A = process.env.E2E_TENANT_ID as string;
const TENANT_B = process.env.E2E_TENANT2_ID as string;
const ORG_A = process.env.E2E_ORG_ID as string;
const CI_RLS_ROLE = "pathway_e2e_rls";

interface AssignmentFixture {
  orgBId: string;
  orgBUserId: string;
  orgAUserId: string;
  orgASiteRoleId: string;
  orgAOtherSiteRoleId: string;
  orgAOrganisationRoleId: string;
}

interface AssignmentInput {
  id?: string;
  orgId?: string;
  tenantId: string | null;
  userId: string;
  roleDefinitionId: string;
  startsAt: Date;
  expiresAt?: Date | null;
  revokedAt?: Date | null;
  revokedById?: string | null;
}

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

async function withRoleRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const roleName = getRlsRoleName();
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
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

async function insertAssignment(input: AssignmentInput): Promise<string> {
  const id = input.id ?? randomUUID();
  await withRoleRlsContext(
    input.tenantId ?? TENANT_A,
    ORG_A,
    (tx) =>
      tx.$executeRaw`
      INSERT INTO "UserRoleAssignment" (
        "id", "orgId", "tenantId", "userId", "roleDefinitionId",
        "assignedById", "startsAt", "expiresAt", "revokedAt", "revokedById"
      ) VALUES (
        ${id},
        ${input.orgId ?? ORG_A},
        ${input.tenantId},
        ${input.userId},
        ${input.roleDefinitionId},
        ${input.userId},
        ${input.startsAt},
        ${input.expiresAt ?? null},
        ${input.revokedAt ?? null},
        ${input.revokedById ?? null}
      )
    `,
  );
  return id;
}

async function expectDatabaseRejection(
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    expect(error).toMatchObject({
      code: "P2010",
      meta: { code: postgresCode },
    });
    return;
  }

  throw new Error("Expected the database operation to be rejected");
}

async function deleteAssignmentsIfPresent(client: PrismaClientType) {
  const table = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('"UserRoleAssignment"')::text AS "exists"
  `;
  if (table[0]?.exists) {
    await client.$executeRaw`DELETE FROM "UserRoleAssignment"`;
  }
}

describe("user role assignment RLS", () => {
  let fixture: AssignmentFixture;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const orgBId = randomUUID();
    const orgBUserId = randomUUID();
    const orgAUserId = randomUUID();
    const orgASiteRoleId = randomUUID();
    const orgAOtherSiteRoleId = randomUUID();
    const orgAOrganisationRoleId = randomUUID();

    await prisma.org.create({
      data: {
        id: orgBId,
        name: "Role assignment org B",
        slug: `role-assignment-org-b-${orgBId}`,
        planCode: "trial",
      },
    });
    await prisma.user.createMany({
      data: [
        { id: orgAUserId, email: `${orgAUserId}@example.test` },
        { id: orgBUserId, email: `${orgBUserId}@example.test` },
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: ORG_A, userId: orgAUserId },
        { orgId: orgBId, userId: orgBUserId },
      ],
    });
    await prisma.orgRoleDefinition.createMany({
      data: [
        {
          id: orgASiteRoleId,
          orgId: ORG_A,
          tenantId: TENANT_A,
          name: `Assignment site A ${orgASiteRoleId}`,
          scope: "site",
          createdById: orgAUserId,
          updatedById: orgAUserId,
        },
        {
          id: orgAOtherSiteRoleId,
          orgId: ORG_A,
          tenantId: TENANT_B,
          name: `Assignment site B ${orgAOtherSiteRoleId}`,
          scope: "site",
          createdById: orgAUserId,
          updatedById: orgAUserId,
        },
        {
          id: orgAOrganisationRoleId,
          orgId: ORG_A,
          name: `Assignment organisation ${orgAOrganisationRoleId}`,
          scope: "organisation",
          createdById: orgAUserId,
          updatedById: orgAUserId,
        },
      ],
    });

    fixture = {
      orgBId,
      orgBUserId,
      orgAUserId,
      orgASiteRoleId,
      orgAOtherSiteRoleId,
      orgAOrganisationRoleId,
    };
  });

  afterEach(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteAssignmentsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;

    await deleteAssignmentsIfPresent(prisma);
    await prisma.orgRoleDefinition.deleteMany({
      where: {
        id: {
          in: [
            fixture.orgASiteRoleId,
            fixture.orgAOtherSiteRoleId,
            fixture.orgAOrganisationRoleId,
          ],
        },
      },
    });
    await prisma.orgMembership.deleteMany({
      where: {
        userId: { in: [fixture.orgAUserId, fixture.orgBUserId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: { in: [fixture.orgAUserId, fixture.orgBUserId] },
      },
    });
    await prisma.org.delete({ where: { id: fixture.orgBId } });
  });

  it("rejects assignments that claim a different organisation", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        insertAssignment({
          orgId: fixture.orgBId,
          tenantId: null,
          userId: fixture.orgAUserId,
          roleDefinitionId: fixture.orgAOrganisationRoleId,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
      "23514",
    );
  });

  it("requires a site assignment to match the role definition site exactly", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        insertAssignment({
          tenantId: TENANT_A,
          userId: fixture.orgAUserId,
          roleDefinitionId: fixture.orgAOtherSiteRoleId,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
      "23503",
    );
  });

  it("does not allow an organisation role to be narrowed to a site", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        insertAssignment({
          tenantId: TENANT_A,
          userId: fixture.orgAUserId,
          roleDefinitionId: fixture.orgAOrganisationRoleId,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
      "23514",
    );
  });

  it("rejects an assignee without membership in the assignment organisation", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        insertAssignment({
          tenantId: TENANT_A,
          userId: fixture.orgBUserId,
          roleDefinitionId: fixture.orgASiteRoleId,
          startsAt: new Date("2026-07-01T00:00:00.000Z"),
        }),
      "23503",
    );
  });

  it("accepts valid site and organisation assignments at their exact scopes", async () => {
    if (!isDatabaseAvailable()) return;

    const siteAssignmentId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const organisationAssignmentId = await insertAssignment({
      tenantId: null,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgAOrganisationRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    const visibleIds = await withRoleRlsContext(
      TENANT_A,
      ORG_A,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "UserRoleAssignment"
        WHERE "id" IN (${siteAssignmentId}, ${organisationAssignmentId})
        ORDER BY "id"
      `,
    );

    expect(visibleIds.map(({ id }) => id).sort()).toEqual(
      [siteAssignmentId, organisationAssignmentId].sort(),
    );
  });

  it("returns only active rows from an effective-assignment query", async () => {
    if (!isDatabaseAvailable()) return;

    const now = new Date("2026-07-27T12:00:00.000Z");
    const activeId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-28T00:00:00.000Z"),
    });
    await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      expiresAt: new Date("2026-07-27T11:59:59.000Z"),
    });
    await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      revokedAt: new Date("2026-07-20T00:00:00.000Z"),
      revokedById: fixture.orgAUserId,
    });

    const effectiveRows = await withRoleRlsContext(
      TENANT_A,
      ORG_A,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
        SELECT "id"
        FROM "UserRoleAssignment"
        WHERE "userId" = ${fixture.orgAUserId}
          AND "startsAt" <= ${now}
          AND ("expiresAt" IS NULL OR "expiresAt" > ${now})
          AND "revokedAt" IS NULL
        ORDER BY "id"
      `,
    );

    expect(effectiveRows).toEqual([{ id: activeId }]);
  });

  it("preserves assignment history by denying row deletion", async () => {
    if (!isDatabaseAvailable()) return;

    const assignmentId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
    });

    const deleted = await withRoleRlsContext(
      TENANT_A,
      ORG_A,
      (tx) =>
        tx.$executeRaw`
        DELETE FROM "UserRoleAssignment" WHERE "id" = ${assignmentId}
      `,
    );

    expect(deleted).toBe(0);
  });
});
