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
  orgASecondUserId: string;
  offboardUserId: string;
  orgASiteRoleId: string;
  orgAAlternateSiteRoleId: string;
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
    const orgASecondUserId = randomUUID();
    const offboardUserId = randomUUID();
    const orgASiteRoleId = randomUUID();
    const orgAAlternateSiteRoleId = randomUUID();
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
        { id: orgASecondUserId, email: `${orgASecondUserId}@example.test` },
        { id: offboardUserId, email: `${offboardUserId}@example.test` },
        { id: orgBUserId, email: `${orgBUserId}@example.test` },
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: ORG_A, userId: orgAUserId },
        { orgId: ORG_A, userId: orgASecondUserId },
        { orgId: ORG_A, userId: offboardUserId },
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
          id: orgAAlternateSiteRoleId,
          orgId: ORG_A,
          tenantId: TENANT_A,
          name: `Assignment alternate site A ${orgAAlternateSiteRoleId}`,
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
      orgASecondUserId,
      offboardUserId,
      orgASiteRoleId,
      orgAAlternateSiteRoleId,
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
            fixture.orgAAlternateSiteRoleId,
            fixture.orgAOtherSiteRoleId,
            fixture.orgAOrganisationRoleId,
          ],
        },
      },
    });
    await prisma.orgMembership.deleteMany({
      where: {
        userId: {
          in: [
            fixture.orgAUserId,
            fixture.orgASecondUserId,
            fixture.offboardUserId,
            fixture.orgBUserId,
          ],
        },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            fixture.orgAUserId,
            fixture.orgASecondUserId,
            fixture.offboardUserId,
            fixture.orgBUserId,
          ],
        },
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
      "23514",
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
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-06-01T00:00:00.000Z"),
      expiresAt: new Date("2026-07-01T00:00:00.000Z"),
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

  it("preserves assignment history after the assignee is removed from the organisation", async () => {
    if (!isDatabaseAvailable()) return;

    const assignmentId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.offboardUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      revokedAt: new Date("2026-07-20T00:00:00.000Z"),
      revokedById: fixture.orgAUserId,
    });

    await prisma.orgMembership.delete({
      where: {
        orgId_userId: {
          orgId: ORG_A,
          userId: fixture.offboardUserId,
        },
      },
    });

    const history = await withRoleRlsContext(
      TENANT_A,
      ORG_A,
      (tx) =>
        tx.$queryRaw<
          Array<{ id: string; isRevoked: boolean; revokedById: string }>
        >`
          SELECT "id", "revokedAt" IS NOT NULL AS "isRevoked", "revokedById"
          FROM "UserRoleAssignment"
          WHERE "id" = ${assignmentId}
        `,
    );

    expect(history).toEqual([
      {
        id: assignmentId,
        isRevoked: true,
        revokedById: fixture.orgAUserId,
      },
    ]);
  });

  it("keeps assignment identity, authority, and time-window facts immutable", async () => {
    if (!isDatabaseAvailable()) return;

    const assignmentId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      expiresAt: new Date("2026-08-01T00:00:00.000Z"),
    });

    const mutations: Array<() => Promise<unknown>> = [
      () =>
        withRoleRlsContext(
          TENANT_A,
          ORG_A,
          (tx) =>
            tx.$executeRaw`
            UPDATE "UserRoleAssignment"
            SET "userId" = ${fixture.orgASecondUserId}
            WHERE "id" = ${assignmentId}
          `,
        ),
      () =>
        withRoleRlsContext(
          TENANT_A,
          ORG_A,
          (tx) =>
            tx.$executeRaw`
            UPDATE "UserRoleAssignment"
            SET "roleDefinitionId" = ${fixture.orgAAlternateSiteRoleId}
            WHERE "id" = ${assignmentId}
          `,
        ),
      () =>
        withRoleRlsContext(
          TENANT_A,
          ORG_A,
          (tx) =>
            tx.$executeRaw`
            UPDATE "UserRoleAssignment"
            SET "assignedById" = ${fixture.orgASecondUserId}
            WHERE "id" = ${assignmentId}
          `,
        ),
      () =>
        withRoleRlsContext(
          TENANT_A,
          ORG_A,
          (tx) =>
            tx.$executeRaw`
            UPDATE "UserRoleAssignment"
            SET "startsAt" = ${new Date("2026-07-02T00:00:00.000Z")}
            WHERE "id" = ${assignmentId}
          `,
        ),
      () =>
        withRoleRlsContext(
          TENANT_A,
          ORG_A,
          (tx) =>
            tx.$executeRaw`
            UPDATE "UserRoleAssignment"
            SET "expiresAt" = ${new Date("2026-08-02T00:00:00.000Z")}
            WHERE "id" = ${assignmentId}
          `,
        ),
    ];

    for (const mutate of mutations) {
      await expectDatabaseRejection(mutate, "23514");
    }
  });

  it("allows a scheduled assignment to be revoked before it starts", async () => {
    if (!isDatabaseAvailable()) return;

    const assignmentId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-08-01T00:00:00.000Z"),
    });
    const revokedAt = new Date("2026-07-27T12:00:00.000Z");

    await withRoleRlsContext(
      TENANT_A,
      ORG_A,
      (tx) =>
        tx.$executeRaw`
          UPDATE "UserRoleAssignment"
          SET "revokedAt" = ${revokedAt},
              "revokedById" = ${fixture.orgASecondUserId}
          WHERE "id" = ${assignmentId}
        `,
    );

    const revoked = await withRoleRlsContext(
      TENANT_A,
      ORG_A,
      (tx) =>
        tx.$queryRaw<
          Array<{ revokedBeforeStart: boolean; revokedById: string }>
        >`
          SELECT "revokedAt" < "startsAt" AS "revokedBeforeStart",
                 "revokedById"
          FROM "UserRoleAssignment"
          WHERE "id" = ${assignmentId}
        `,
    );

    expect(revoked).toEqual([
      {
        revokedBeforeStart: true,
        revokedById: fixture.orgASecondUserId,
      },
    ]);
  });

  it("does not allow an existing revocation to be changed or cleared", async () => {
    if (!isDatabaseAvailable()) return;

    const assignmentId = await insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
      revokedAt: new Date("2026-07-20T00:00:00.000Z"),
      revokedById: fixture.orgASecondUserId,
    });

    await expectDatabaseRejection(
      () =>
        withRoleRlsContext(
          TENANT_A,
          ORG_A,
          (tx) =>
            tx.$executeRaw`
            UPDATE "UserRoleAssignment"
            SET "revokedAt" = NULL,
                "revokedById" = NULL
            WHERE "id" = ${assignmentId}
          `,
        ),
      "23514",
    );
  });

  it("serializes assignment creation behind a concurrent role site change", async () => {
    if (!isDatabaseAvailable()) return;

    let releaseRoleUpdate: (() => void) | undefined;
    const roleUpdateCanCommit = new Promise<void>((resolve) => {
      releaseRoleUpdate = resolve;
    });
    let roleUpdateStarted: (() => void) | undefined;
    const roleUpdateHasLock = new Promise<void>((resolve) => {
      roleUpdateStarted = resolve;
    });

    const roleUpdate = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "OrgRoleDefinition"
        SET "tenantId" = ${TENANT_B}
        WHERE "id" = ${fixture.orgASiteRoleId}
      `;
      roleUpdateStarted?.();
      await roleUpdateCanCommit;
    });

    await roleUpdateHasLock;
    const assignmentInsert = insertAssignment({
      tenantId: TENANT_A,
      userId: fixture.orgAUserId,
      roleDefinitionId: fixture.orgASiteRoleId,
      startsAt: new Date("2026-07-01T00:00:00.000Z"),
    });
    const beforeRoleCommit = await Promise.race([
      assignmentInsert.then(
        () => "resolved" as const,
        () => "rejected" as const,
      ),
      new Promise<"pending">((resolve) => {
        setTimeout(() => resolve("pending"), 200);
      }),
    ]);

    releaseRoleUpdate?.();

    try {
      await roleUpdate;
      expect(beforeRoleCommit).toBe("pending");
      await expectDatabaseRejection(() => assignmentInsert, "23514");
    } finally {
      await assignmentInsert.catch(() => undefined);
      await deleteAssignmentsIfPresent(prisma);
      await prisma.orgRoleDefinition.update({
        where: { id: fixture.orgASiteRoleId },
        data: { tenantId: TENANT_A },
      });
    }
  });

  it("rejects a role site change queued behind assignment creation", async () => {
    if (!isDatabaseAvailable()) return;

    const assignmentId = randomUUID();
    let releaseAssignment: (() => void) | undefined;
    const assignmentCanCommit = new Promise<void>((resolve) => {
      releaseAssignment = resolve;
    });
    let assignmentInserted: (() => void) | undefined;
    const assignmentHasRoleLock = new Promise<void>((resolve) => {
      assignmentInserted = resolve;
    });

    const assignmentInsert = withRoleRlsContext(TENANT_A, ORG_A, async (tx) => {
      await tx.$executeRaw`
          INSERT INTO "UserRoleAssignment" (
            "id", "orgId", "tenantId", "userId", "roleDefinitionId",
            "assignedById", "startsAt"
          ) VALUES (
            ${assignmentId},
            ${ORG_A},
            ${TENANT_A},
            ${fixture.orgAUserId},
            ${fixture.orgASiteRoleId},
            ${fixture.orgAUserId},
            ${new Date("2026-07-01T00:00:00.000Z")}
          )
        `;
      assignmentInserted?.();
      await assignmentCanCommit;
    });

    await Promise.race([assignmentHasRoleLock, assignmentInsert]);
    const roleUpdate = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        UPDATE "OrgRoleDefinition"
        SET "tenantId" = ${TENANT_B}
        WHERE "id" = ${fixture.orgASiteRoleId}
      `;
      await tx.$executeRaw`
        SET CONSTRAINTS "OrgRoleDefinition_preserve_assigned_scope" IMMEDIATE
      `;
    });
    const beforeAssignmentCommit = await Promise.race([
      roleUpdate.then(
        () => "resolved" as const,
        () => "rejected" as const,
      ),
      new Promise<"pending">((resolve) => {
        setTimeout(() => resolve("pending"), 200);
      }),
    ]);

    releaseAssignment?.();

    try {
      await assignmentInsert;
      expect(beforeAssignmentCommit).toBe("pending");
      await expectDatabaseRejection(() => roleUpdate, "23514");
    } finally {
      await roleUpdate.catch(() => undefined);
      await deleteAssignmentsIfPresent(prisma);
      await prisma.orgRoleDefinition.update({
        where: { id: fixture.orgASiteRoleId },
        data: { tenantId: TENANT_A },
      });
    }
  });
});
