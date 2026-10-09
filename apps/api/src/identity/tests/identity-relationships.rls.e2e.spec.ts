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

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface IdentityFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  childAId: string;
  childA2Id: string;
  childBId: string;
  guardianAUserId: string;
  guardianBUserId: string;
  studentUserId: string;
  unrelatedUserId: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withIdentityRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (useTenantRlsRole()) {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    }

    return callback(tx);
  });
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

async function insertStudentPortalPolicy(
  tx: Prisma.TransactionClient,
  tenantId: string,
  studentPortalEnabled: boolean,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "StudentPortalPolicy" ("tenantId", "studentPortalEnabled")
    VALUES (${tenantId}, ${studentPortalEnabled})
  `;
}

async function insertGuardianIdentity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId")
    VALUES (${id}, ${tenantId}, ${userId})
  `;
  return id;
}

async function insertStudentIdentity(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
    VALUES (${id}, ${tenantId}, ${userId})
  `;
  return id;
}

async function insertGuardianChildRelationship(
  tx: Prisma.TransactionClient,
  options: {
    tenantId: string;
    guardianIdentityId: string;
    childId: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "GuardianChildRelationship" (
      "id", "tenantId", "guardianIdentityId", "childId", "legalAccess"
    ) VALUES (
      ${id}, ${options.tenantId}, ${options.guardianIdentityId},
      ${options.childId}, 'FULL'
    )
  `;
  return id;
}

async function insertStudentIdentityLink(
  tx: Prisma.TransactionClient,
  options: {
    tenantId: string;
    studentIdentityId: string;
    childId: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "StudentIdentityLink" (
      "id", "tenantId", "studentIdentityId", "childId"
    ) VALUES (
      ${id}, ${options.tenantId}, ${options.studentIdentityId}, ${options.childId}
    )
  `;
  return id;
}

async function insertFamilyIdentityInvite(
  tx: Prisma.TransactionClient,
  options: {
    tenantId: string;
    invitedUserId: string;
    createdByUserId: string;
    expiresAt: Date;
    acceptedAt?: Date | null;
    acceptedGuardianIdentityId?: string | null;
    acceptedStudentIdentityId?: string | null;
    revokedAt?: Date | null;
    revokedByUserId?: string | null;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "FamilyIdentityInvite" (
      "id", "tenantId", "invitedUserId", "target", "createdByUserId",
      "expiresAt", "acceptedAt", "acceptedGuardianIdentityId",
      "acceptedStudentIdentityId", "revokedAt", "revokedByUserId"
    ) VALUES (
      ${id}, ${options.tenantId}, ${options.invitedUserId}, 'GUARDIAN',
      ${options.createdByUserId}, ${options.expiresAt},
      ${options.acceptedAt ?? null}, ${options.acceptedGuardianIdentityId ?? null},
      ${options.acceptedStudentIdentityId ?? null}, ${options.revokedAt ?? null},
      ${options.revokedByUserId ?? null}
    )
  `;
  return id;
}

async function deleteIdentityRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."StudentPortalPolicy"')::text AS "exists"
  `;

  if (!row?.exists) return;

  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AceSchoolVolunteerReservation",
      "AceNoticeReceipt",
      "AceNoticeAttachment",
      "AceNoticeAudienceMember",
      "AceNotice",
      "MessageAttachment",
      "MessageDelivery",
      "MessageParticipantReadCursor",
      "Message",
      "MessageParticipant",
      "MessageConversation",
      "FaithReflection",
      "FaithReadReceipt",
      "PermissionSlipResponse",
      "StudentIdentityLink",
      "GuardianChildRelationship",
      "FamilyIdentityInvite",
      "GuardianIdentity",
      "StudentIdentity",
      "StudentPortalPolicy"
  `);
}

describe("ACE student identity and guardian relationships", () => {
  let fixture: IdentityFixture;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    fixture = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      childAId: randomUUID(),
      childA2Id: randomUUID(),
      childBId: randomUUID(),
      guardianAUserId: randomUUID(),
      guardianBUserId: randomUUID(),
      studentUserId: randomUUID(),
      unrelatedUserId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgAId,
          name: `identity org A ${fixture.orgAId}`,
          slug: `identity-a-${fixture.orgAId}`,
          planCode: "trial",
        },
        {
          id: fixture.orgBId,
          name: `identity org B ${fixture.orgBId}`,
          slug: `identity-b-${fixture.orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          orgId: fixture.orgAId,
          name: `identity tenant A ${fixture.tenantAId}`,
          slug: `identity-a-${fixture.tenantAId}`,
        },
        {
          id: fixture.tenantBId,
          orgId: fixture.orgBId,
          name: `identity tenant B ${fixture.tenantBId}`,
          slug: `identity-b-${fixture.tenantBId}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        fixture.guardianAUserId,
        fixture.guardianBUserId,
        fixture.studentUserId,
        fixture.unrelatedUserId,
      ].map((id) => ({ id, email: `${id}@example.test` })),
    });

    await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.child.create({
          data: {
            id: fixture.childAId,
            firstName: "Identity",
            lastName: "Child A",
            tenantId: fixture.tenantAId,
          },
        });
        await tx.child.create({
          data: {
            id: fixture.childA2Id,
            firstName: "Identity",
            lastName: "Child A2",
            tenantId: fixture.tenantAId,
          },
        });
      },
    );
    await withIdentityRlsContext(fixture.tenantBId, fixture.orgBId, (tx) =>
      tx.child.create({
        data: {
          id: fixture.childBId,
          firstName: "Identity",
          lastName: "Child B",
          tenantId: fixture.tenantBId,
        },
      }),
    );
  });

  afterEach(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteIdentityRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;

    await deleteIdentityRowsIfPresent(prisma);
    await prisma.child.deleteMany({
      where: {
        id: { in: [fixture.childAId, fixture.childA2Id, fixture.childBId] },
      },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            fixture.guardianAUserId,
            fixture.guardianBUserId,
            fixture.studentUserId,
            fixture.unrelatedUserId,
          ],
        },
      },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [fixture.orgAId, fixture.orgBId] } },
    });
  });

  it("allows two guardians for one child and one guardian for two children", async () => {
    if (!isDatabaseAvailable()) return;

    const relationshipCount = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const guardianAId = await insertGuardianIdentity(
          tx,
          fixture.tenantAId,
          fixture.guardianAUserId,
        );
        const guardianBId = await insertGuardianIdentity(
          tx,
          fixture.tenantAId,
          fixture.guardianBUserId,
        );

        await insertGuardianChildRelationship(tx, {
          tenantId: fixture.tenantAId,
          guardianIdentityId: guardianAId,
          childId: fixture.childAId,
        });
        await insertGuardianChildRelationship(tx, {
          tenantId: fixture.tenantAId,
          guardianIdentityId: guardianBId,
          childId: fixture.childAId,
        });
        await insertGuardianChildRelationship(tx, {
          tenantId: fixture.tenantAId,
          guardianIdentityId: guardianAId,
          childId: fixture.childA2Id,
        });

        const [count] = await tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(*) FROM "GuardianChildRelationship"
        `;
        return count.count;
      },
    );

    expect(relationshipCount).toBe(3n);
  });

  it("requires enabled student policy and one active student link", async () => {
    if (!isDatabaseAvailable()) return;

    const studentIdentityId = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await insertStudentPortalPolicy(tx, fixture.tenantAId, false);
        return insertStudentIdentity(
          tx,
          fixture.tenantAId,
          fixture.studentUserId,
        );
      },
    );

    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertStudentIdentityLink(tx, {
            tenantId: fixture.tenantAId,
            studentIdentityId,
            childId: fixture.childAId,
          }),
        ),
      "23514",
    );

    const { linkId, otherStudentIdentityId } = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.$executeRaw`
          UPDATE "StudentPortalPolicy"
          SET "studentPortalEnabled" = true
          WHERE "tenantId" = ${fixture.tenantAId}
        `;
        const linkId = await insertStudentIdentityLink(tx, {
          tenantId: fixture.tenantAId,
          studentIdentityId,
          childId: fixture.childAId,
        });
        return {
          linkId,
          otherStudentIdentityId: await insertStudentIdentity(
            tx,
            fixture.tenantAId,
            fixture.unrelatedUserId,
          ),
        };
      },
    );

    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertStudentIdentityLink(tx, {
            tenantId: fixture.tenantAId,
            studentIdentityId: otherStudentIdentityId,
            childId: fixture.childAId,
          }),
        ),
      "23505",
    );

    await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$executeRaw`
          UPDATE "StudentPortalPolicy"
          SET "studentPortalEnabled" = false
          WHERE "tenantId" = ${fixture.tenantAId}
        `,
    );
    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "StudentIdentityLink"
            SET "childId" = ${fixture.childA2Id}
            WHERE "id" = ${linkId}
          `,
        ),
      "55000",
    );
  });

  it("requires complete revocation metadata for relationship records", async () => {
    if (!isDatabaseAvailable()) return;

    const { guardianRelationshipId, studentLinkId } =
      await withIdentityRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          await insertStudentPortalPolicy(tx, fixture.tenantAId, true);
          const guardianIdentityId = await insertGuardianIdentity(
            tx,
            fixture.tenantAId,
            fixture.guardianAUserId,
          );
          const studentIdentityId = await insertStudentIdentity(
            tx,
            fixture.tenantAId,
            fixture.studentUserId,
          );
          return {
            guardianRelationshipId: await insertGuardianChildRelationship(tx, {
              tenantId: fixture.tenantAId,
              guardianIdentityId,
              childId: fixture.childAId,
            }),
            studentLinkId: await insertStudentIdentityLink(tx, {
              tenantId: fixture.tenantAId,
              studentIdentityId,
              childId: fixture.childA2Id,
            }),
          };
        },
      );
    const revokedAt = new Date(Date.now() + 60_000);

    for (const revocationReason of [null, "  "] as const) {
      await expectDatabaseRejection(
        () =>
          withIdentityRlsContext(
            fixture.tenantAId,
            fixture.orgAId,
            (tx) =>
              tx.$executeRaw`
              UPDATE "StudentIdentityLink"
              SET
                "revokedAt" = ${revokedAt},
                "revokedByUserId" = ${fixture.guardianAUserId},
                "revocationReason" = ${revocationReason}
              WHERE "id" = ${studentLinkId}
            `,
          ),
        "23514",
      );
      await expectDatabaseRejection(
        () =>
          withIdentityRlsContext(
            fixture.tenantAId,
            fixture.orgAId,
            (tx) =>
              tx.$executeRaw`
              UPDATE "GuardianChildRelationship"
              SET
                "revokedAt" = ${revokedAt},
                "revokedByUserId" = ${fixture.guardianAUserId},
                "revocationReason" = ${revocationReason}
              WHERE "id" = ${guardianRelationshipId}
            `,
          ),
        "23514",
      );
    }
  });

  it("rejects cross-tenant identity and relationship joins", async () => {
    if (!isDatabaseAvailable()) return;

    const { guardianIdentityId, studentIdentityId } =
      await withIdentityRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          await insertStudentPortalPolicy(tx, fixture.tenantAId, true);
          return {
            guardianIdentityId: await insertGuardianIdentity(
              tx,
              fixture.tenantAId,
              fixture.guardianAUserId,
            ),
            studentIdentityId: await insertStudentIdentity(
              tx,
              fixture.tenantAId,
              fixture.studentUserId,
            ),
          };
        },
      );

    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertGuardianChildRelationship(tx, {
            tenantId: fixture.tenantAId,
            guardianIdentityId,
            childId: fixture.childBId,
          }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertStudentIdentityLink(tx, {
            tenantId: fixture.tenantAId,
            studentIdentityId,
            childId: fixture.childBId,
          }),
        ),
      "23503",
    );
  });

  it("retains but rejects invalid invitation lifecycle transitions", async () => {
    if (!isDatabaseAvailable()) return;

    const expiresAt = new Date("2026-09-30T12:00:00.000Z");
    const guardianIdentityId = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertGuardianIdentity(tx, fixture.tenantAId, fixture.guardianAUserId),
    );
    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertFamilyIdentityInvite(tx, {
            tenantId: fixture.tenantAId,
            invitedUserId: fixture.guardianAUserId,
            createdByUserId: fixture.guardianBUserId,
            expiresAt,
            acceptedAt: new Date("2026-10-01T12:00:00.000Z"),
            acceptedGuardianIdentityId: guardianIdentityId,
          }),
        ),
      "23514",
    );

    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertFamilyIdentityInvite(tx, {
            tenantId: fixture.tenantAId,
            invitedUserId: fixture.guardianBUserId,
            createdByUserId: fixture.guardianAUserId,
            expiresAt,
            acceptedAt: new Date("2026-09-20T12:00:00.000Z"),
            acceptedGuardianIdentityId: guardianIdentityId,
          }),
        ),
      "23503",
    );

    const acceptedInviteId = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertFamilyIdentityInvite(tx, {
          tenantId: fixture.tenantAId,
          invitedUserId: fixture.guardianAUserId,
          createdByUserId: fixture.guardianBUserId,
          expiresAt,
          acceptedAt: new Date("2026-09-20T12:00:00.000Z"),
          acceptedGuardianIdentityId: guardianIdentityId,
        }),
    );
    const [acceptedInvite] = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ acceptedGuardianIdentityId: string }>>`
          SELECT "acceptedGuardianIdentityId"
          FROM "FamilyIdentityInvite"
          WHERE "id" = ${acceptedInviteId}
        `,
    );
    expect(acceptedInvite).toEqual({
      acceptedGuardianIdentityId: guardianIdentityId,
    });

    const inviteId = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        insertFamilyIdentityInvite(tx, {
          tenantId: fixture.tenantAId,
          invitedUserId: fixture.guardianAUserId,
          createdByUserId: fixture.guardianBUserId,
          expiresAt,
          revokedAt: new Date("2026-09-20T12:00:00.000Z"),
          revokedByUserId: fixture.guardianBUserId,
        }),
    );
    await expectDatabaseRejection(
      () =>
        withIdentityRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            UPDATE "FamilyIdentityInvite"
            SET "acceptedAt" = ${new Date("2026-09-21T12:00:00.000Z")}
            WHERE "id" = ${inviteId}
          `,
        ),
      "23514",
    );
  });

  it("fails closed with forced tenant RLS", async () => {
    if (!isDatabaseAvailable()) return;

    await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await insertStudentPortalPolicy(tx, fixture.tenantAId, true);
        const guardianIdentityId = await insertGuardianIdentity(
          tx,
          fixture.tenantAId,
          fixture.guardianAUserId,
        );
        const studentIdentityId = await insertStudentIdentity(
          tx,
          fixture.tenantAId,
          fixture.studentUserId,
        );
        await insertGuardianChildRelationship(tx, {
          tenantId: fixture.tenantAId,
          guardianIdentityId,
          childId: fixture.childAId,
        });
        await insertStudentIdentityLink(tx, {
          tenantId: fixture.tenantAId,
          studentIdentityId,
          childId: fixture.childAId,
        });
        await insertFamilyIdentityInvite(tx, {
          tenantId: fixture.tenantAId,
          invitedUserId: fixture.guardianBUserId,
          createdByUserId: fixture.guardianAUserId,
          expiresAt: new Date("2026-09-30T12:00:00.000Z"),
        });
      },
    );

    const tenantBCounts = await withIdentityRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            policy: bigint;
            guardianIdentity: bigint;
            studentIdentity: bigint;
            studentLink: bigint;
            guardianRelationship: bigint;
            invite: bigint;
          }>
        >`
          SELECT
            (SELECT count(*) FROM "StudentPortalPolicy") AS "policy",
            (SELECT count(*) FROM "GuardianIdentity") AS "guardianIdentity",
            (SELECT count(*) FROM "StudentIdentity") AS "studentIdentity",
            (SELECT count(*) FROM "StudentIdentityLink") AS "studentLink",
            (SELECT count(*) FROM "GuardianChildRelationship") AS "guardianRelationship",
            (SELECT count(*) FROM "FamilyIdentityInvite") AS "invite"
        `,
    );
    expect(tenantBCounts).toEqual([
      {
        policy: 0n,
        guardianIdentity: 0n,
        studentIdentity: 0n,
        studentLink: 0n,
        guardianRelationship: 0n,
        invite: 0n,
      },
    ]);

    const [unrelatedUserChildScope] = await withIdentityRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ count: bigint }>>`
          SELECT count(DISTINCT "childId")
          FROM (
            SELECT relationship."childId"
            FROM "GuardianChildRelationship" AS relationship
            JOIN "GuardianIdentity" AS identity
              ON identity."id" = relationship."guardianIdentityId"
             AND identity."tenantId" = relationship."tenantId"
            WHERE identity."userId" = ${fixture.unrelatedUserId}
            UNION ALL
            SELECT link."childId"
            FROM "StudentIdentityLink" AS link
            JOIN "StudentIdentity" AS identity
              ON identity."id" = link."studentIdentityId"
             AND identity."tenantId" = link."tenantId"
            WHERE identity."userId" = ${fixture.unrelatedUserId}
          ) AS "derivedChildScope"
        `,
    );
    expect(unrelatedUserChildScope.count).toBe(0n);

    if (!useTenantRlsRole()) return;

    const missingContextCounts = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
      return tx.$queryRaw<
        Array<{
          policy: bigint;
          guardianIdentity: bigint;
          studentIdentity: bigint;
          studentLink: bigint;
          guardianRelationship: bigint;
          invite: bigint;
        }>
      >`
        SELECT
          (SELECT count(*) FROM "StudentPortalPolicy") AS "policy",
          (SELECT count(*) FROM "GuardianIdentity") AS "guardianIdentity",
          (SELECT count(*) FROM "StudentIdentity") AS "studentIdentity",
          (SELECT count(*) FROM "StudentIdentityLink") AS "studentLink",
          (SELECT count(*) FROM "GuardianChildRelationship") AS "guardianRelationship",
          (SELECT count(*) FROM "FamilyIdentityInvite") AS "invite"
      `;
    });
    expect(missingContextCounts).toEqual([
      {
        policy: 0n,
        guardianIdentity: 0n,
        studentIdentity: 0n,
        studentLink: 0n,
        guardianRelationship: 0n,
        invite: 0n,
      },
    ]);
  });
});
