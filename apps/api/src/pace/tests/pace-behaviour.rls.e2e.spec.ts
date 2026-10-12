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
import { isEncryptedField } from "@pathway/util";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface PaceBehaviourFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  childAId: string;
  childA2Id: string;
  childBId: string;
  subjectAId: string;
  subjectA2Id: string;
  subjectBId: string;
  actorAId: string;
  actorBId: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withPaceRlsContext<T>(
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

async function insertPaceAssessment(
  tx: Prisma.TransactionClient,
  fixture: PaceBehaviourFixture,
  options: {
    id?: string;
    tenantId?: string;
    childId?: string;
    subjectId?: string;
    actorId?: string;
    correctsAssessmentId?: string | null;
    policyOverrideId?: string | null;
    paceNumber?: number;
    score?: number;
  } = {},
): Promise<string> {
  const id = options.id ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO "PaceAssessment" (
      "id", "tenantId", "childId", "subjectId", "paceNumber",
      "assessmentType", "score", "result", "assessedOn", "recordedByUserId",
      "reason", "policyOverrideId", "correctsAssessmentId"
    ) VALUES (
      ${id},
      ${options.tenantId ?? fixture.tenantAId},
      ${options.childId ?? fixture.childAId},
      ${options.subjectId ?? fixture.subjectAId},
      ${options.paceNumber ?? 101},
      'PACE_TEST',
      ${options.score ?? 92},
      'PASSED',
      ${new Date("2026-09-15T00:00:00.000Z")},
      ${options.actorId ?? fixture.actorAId},
      'Recorded PACE assessment',
      ${options.policyOverrideId ?? null},
      ${options.correctsAssessmentId ?? null}
    )
  `;
  return id;
}

async function insertBehaviourEntry(
  tx: Prisma.TransactionClient,
  fixture: PaceBehaviourFixture,
  options: {
    id?: string;
    childId?: string;
    correctsBehaviourEntryId?: string | null;
    note?: string | null;
  } = {},
): Promise<string> {
  const id = options.id ?? randomUUID();
  await tx.$executeRaw`
    INSERT INTO "BehaviourEntry" (
      "id", "tenantId", "childId", "type", "visibility", "category",
      "pointsDelta", "occurredAt", "recordedByUserId", "reason", "note",
      "correctsBehaviourEntryId"
    ) VALUES (
      ${id},
      ${fixture.tenantAId},
      ${options.childId ?? fixture.childAId},
      'DEMERIT',
      'SENSITIVE',
      'conduct',
      -2,
      ${new Date("2026-09-15T09:30:00.000Z")},
      ${fixture.actorAId},
      'Recorded behaviour event',
      ${options.note ?? null},
      ${options.correctsBehaviourEntryId ?? null}
    )
  `;
  return id;
}

async function insertPolicies(
  tx: Prisma.TransactionClient,
  fixture: PaceBehaviourFixture,
): Promise<{ pacePolicyId: string; demeritPolicyId: string }> {
  const pacePolicyId = randomUUID();
  const demeritPolicyId = randomUUID();

  await tx.$executeRaw`
    INSERT INTO "PacePolicy" (
      "id", "tenantId", "version", "selfTestPassingScore", "paceTestPassingScore",
      "maxAssessmentsPerDay", "allowSamePaceSameDay", "effectiveFrom",
      "createdByUserId", "reason"
    ) VALUES (
      ${pacePolicyId}, ${fixture.tenantAId}, 1, 80, 80, 2, false,
      ${new Date("2026-09-01T00:00:00.000Z")}, ${fixture.actorAId},
      'Initial PACE policy'
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "DemeritPolicy" (
      "id", "tenantId", "version", "windowDays", "stageOneThreshold",
      "stageTwoThreshold", "stageThreeThreshold", "seriousMisconductStage",
      "effectiveFrom", "createdByUserId", "reason"
    ) VALUES (
      ${demeritPolicyId}, ${fixture.tenantAId}, 1, 30, 3, 6, 10, 3,
      ${new Date("2026-09-01T00:00:00.000Z")}, ${fixture.actorAId},
      'Initial demerit policy'
    )
  `;

  return { pacePolicyId, demeritPolicyId };
}

async function deletePaceBehaviourRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."PaceAssessment"')::text AS "exists"
  `;

  if (!row?.exists) return;

  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "PaceProgress",
      "PaceAssessment",
      "PacePolicyOverride",
      "PacePolicy",
      "BehaviourEntry",
      "DemeritStageOverride",
      "DemeritPolicy"
  `);
}

describe("ACE PACE and behaviour fact storage", () => {
  let fixture: PaceBehaviourFixture;

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
      subjectAId: randomUUID(),
      subjectA2Id: randomUUID(),
      subjectBId: randomUUID(),
      actorAId: randomUUID(),
      actorBId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgAId,
          name: `PACE org A ${fixture.orgAId}`,
          slug: `pace-a-${fixture.orgAId}`,
          planCode: "trial",
        },
        {
          id: fixture.orgBId,
          name: `PACE org B ${fixture.orgBId}`,
          slug: `pace-b-${fixture.orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          orgId: fixture.orgAId,
          name: `PACE tenant A ${fixture.tenantAId}`,
          slug: `pace-a-${fixture.tenantAId}`,
        },
        {
          id: fixture.tenantBId,
          orgId: fixture.orgBId,
          name: `PACE tenant B ${fixture.tenantBId}`,
          slug: `pace-b-${fixture.tenantBId}`,
        },
      ],
    });

    await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.user.create({
          data: {
            id: fixture.actorAId,
            email: `${fixture.actorAId}@example.test`,
            tenantId: fixture.tenantAId,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId: fixture.tenantAId, userId: fixture.actorAId },
        });
        await tx.child.create({
          data: {
            id: fixture.childAId,
            firstName: "PACE",
            lastName: "Child A",
            tenantId: fixture.tenantAId,
          },
        });
        await tx.child.create({
          data: {
            id: fixture.childA2Id,
            firstName: "PACE",
            lastName: "Child A2",
            tenantId: fixture.tenantAId,
          },
        });
        await tx.subject.create({
          data: {
            id: fixture.subjectAId,
            name: `PACE subject A ${fixture.subjectAId}`,
            tenantId: fixture.tenantAId,
          },
        });
        await tx.subject.create({
          data: {
            id: fixture.subjectA2Id,
            name: `PACE subject A2 ${fixture.subjectA2Id}`,
            tenantId: fixture.tenantAId,
          },
        });
      },
    );
    await withTenantRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      async (tx) => {
        await tx.user.create({
          data: {
            id: fixture.actorBId,
            email: `${fixture.actorBId}@example.test`,
            tenantId: fixture.tenantBId,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId: fixture.tenantBId, userId: fixture.actorBId },
        });
        await tx.child.create({
          data: {
            id: fixture.childBId,
            firstName: "PACE",
            lastName: "Child B",
            tenantId: fixture.tenantBId,
          },
        });
        await tx.subject.create({
          data: {
            id: fixture.subjectBId,
            name: `PACE subject B ${fixture.subjectBId}`,
            tenantId: fixture.tenantBId,
          },
        });
      },
    );
  });

  afterEach(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deletePaceBehaviourRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;

    await deletePaceBehaviourRowsIfPresent(prisma);
    await prisma.subject.deleteMany({
      where: {
        id: {
          in: [fixture.subjectAId, fixture.subjectA2Id, fixture.subjectBId],
        },
      },
    });
    await prisma.child.deleteMany({
      where: {
        id: { in: [fixture.childAId, fixture.childA2Id, fixture.childBId] },
      },
    });
    await prisma.siteMembership.deleteMany({
      where: { userId: { in: [fixture.actorAId, fixture.actorBId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [fixture.actorAId, fixture.actorBId] } },
    });
    await prisma.tenant.deleteMany({
      where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [fixture.orgAId, fixture.orgBId] } },
    });
  });

  it("rejects update and deletion of published PACE and behaviour facts", async () => {
    if (!isDatabaseAvailable()) return;

    const { assessmentId, behaviourEntryId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => ({
        assessmentId: await insertPaceAssessment(tx, fixture),
        behaviourEntryId: await insertBehaviourEntry(tx, fixture),
      }),
    );

    for (const operation of [
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`UPDATE "PaceAssessment" SET "score" = 100 WHERE "id" = ${assessmentId}`,
        ),
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`DELETE FROM "PaceAssessment" WHERE "id" = ${assessmentId}`,
        ),
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`UPDATE "BehaviourEntry" SET "pointsDelta" = -3 WHERE "id" = ${behaviourEntryId}`,
        ),
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`DELETE FROM "BehaviourEntry" WHERE "id" = ${behaviourEntryId}`,
        ),
    ]) {
      await expectDatabaseRejection(operation, "55000");
    }
  });

  it("keeps corrections as a one-successor chain and excludes superseded facts", async () => {
    if (!isDatabaseAvailable()) return;

    const { originalId, correctionId, latestCorrectionId } =
      await withPaceRlsContext(
        fixture.tenantAId,
        fixture.orgAId,
        async (tx) => {
          const originalId = await insertPaceAssessment(tx, fixture);
          const correctionId = await insertPaceAssessment(tx, fixture, {
            correctsAssessmentId: originalId,
            score: 94,
          });
          const latestCorrectionId = await insertPaceAssessment(tx, fixture, {
            correctsAssessmentId: correctionId,
            score: 96,
          });
          return { originalId, correctionId, latestCorrectionId };
        },
      );

    const currentIds = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
          SELECT fact."id"
          FROM "PaceAssessment" AS fact
          WHERE fact."tenantId" = ${fixture.tenantAId}
            AND NOT EXISTS (
              SELECT 1
              FROM "PaceAssessment" AS correction
              WHERE correction."tenantId" = fact."tenantId"
                AND correction."correctsAssessmentId" = fact."id"
            )
          ORDER BY fact."createdAt", fact."id"
        `,
    );

    expect(currentIds).toEqual([{ id: latestCorrectionId }]);

    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, {
            correctsAssessmentId: originalId,
            score: 98,
          }),
        ),
      "23505",
    );
    expect(correctionId).not.toBe(originalId);
  });

  it("keeps behaviour corrections as complete linked facts", async () => {
    if (!isDatabaseAvailable()) return;

    const { originalId, correctionId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const originalId = await insertBehaviourEntry(tx, fixture);
        const correctionId = await insertBehaviourEntry(tx, fixture, {
          correctsBehaviourEntryId: originalId,
        });
        return { originalId, correctionId };
      },
    );
    const [correction] = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            correctsBehaviourEntryId: string;
            type: string;
            pointsDelta: number;
            reason: string;
          }>
        >`
          SELECT "correctsBehaviourEntryId", "type"::text, "pointsDelta", "reason"
          FROM "BehaviourEntry"
          WHERE "id" = ${correctionId}
        `,
    );

    expect(correction).toEqual({
      correctsBehaviourEntryId: originalId,
      type: "DEMERIT",
      pointsDelta: -2,
      reason: "Recorded behaviour event",
    });
  });

  it("requires non-empty reasons and future expiry for both override types", async () => {
    if (!isDatabaseAvailable()) return;

    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const expiredAt = new Date(Date.now() - 60 * 60 * 1000);
    const forgedCreatedAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const { pacePolicyId, demeritPolicyId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPolicies(tx, fixture),
    );

    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "PacePolicyOverride" (
              "id", "tenantId", "childId", "subjectId", "pacePolicyId",
              "policyCode", "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
              ${fixture.actorAId}, '  ', ${futureExpiry}
            )
          `,
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "PacePolicyOverride" (
              "id", "tenantId", "childId", "subjectId", "pacePolicyId",
              "policyCode", "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
              ${fixture.actorAId}, 'Approved exception', NULL
            )
          `,
      ),
      "23502",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            INSERT INTO "PacePolicyOverride" (
              "id", "tenantId", "childId", "subjectId", "pacePolicyId",
              "policyCode", "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
              ${fixture.actorAId}, 'Expired exception',
              ${expiredAt}
            )
          `,
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            INSERT INTO "PacePolicyOverride" (
              "id", "tenantId", "childId", "subjectId", "pacePolicyId",
              "policyCode", "authorisedByUserId", "reason", "createdAt",
              "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
              ${fixture.actorAId}, 'Forged timestamp', ${forgedCreatedAt},
              ${expiredAt}
            )
          `,
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "DemeritStageOverride" (
              "id", "tenantId", "childId", "demeritPolicyId", "stage",
              "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${demeritPolicyId}, 2, ${fixture.actorAId}, '',
              ${futureExpiry}
            )
          `,
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "DemeritStageOverride" (
              "id", "tenantId", "childId", "demeritPolicyId", "stage",
              "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${demeritPolicyId}, 2, ${fixture.actorAId}, 'Manual stage', NULL
            )
          `,
      ),
      "23502",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            INSERT INTO "DemeritStageOverride" (
              "id", "tenantId", "childId", "demeritPolicyId", "stage",
              "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${demeritPolicyId}, 2, ${fixture.actorAId}, 'Expired stage',
              ${expiredAt}
            )
          `,
        ),
      "23514",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            INSERT INTO "DemeritStageOverride" (
              "id", "tenantId", "childId", "demeritPolicyId", "stage",
              "authorisedByUserId", "reason", "createdAt", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${demeritPolicyId}, 2, ${fixture.actorAId}, 'Forged timestamp',
              ${forgedCreatedAt}, ${expiredAt}
            )
          `,
        ),
      "23514",
    );
  });

  it("rejects an infinite PACE policy override expiry", async () => {
    if (!isDatabaseAvailable()) return;

    const { pacePolicyId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPolicies(tx, fixture),
    );

    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            INSERT INTO "PacePolicyOverride" (
              "id", "tenantId", "childId", "subjectId", "pacePolicyId",
              "policyCode", "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
              ${fixture.actorAId}, 'Unbounded exception', TIMESTAMP 'infinity'
            )
          `,
        ),
      "23514",
    );
  });

  it("rejects an infinite demerit stage override expiry", async () => {
    if (!isDatabaseAvailable()) return;

    const { demeritPolicyId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPolicies(tx, fixture),
    );

    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            INSERT INTO "DemeritStageOverride" (
              "id", "tenantId", "childId", "demeritPolicyId", "stage",
              "authorisedByUserId", "reason", "expiresAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
              ${demeritPolicyId}, 2, ${fixture.actorAId}, 'Unbounded stage',
              TIMESTAMP 'infinity'
            )
          `,
        ),
      "23514",
    );
  });

  it("rejects PACE overrides for another child or subject in the same tenant", async () => {
    if (!isDatabaseAvailable()) return;

    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const { pacePolicyId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPolicies(tx, fixture),
    );
    const childOverrideId = randomUUID();
    const subjectOverrideId = randomUUID();

    await withPaceRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "PacePolicyOverride" (
          "id", "tenantId", "childId", "subjectId", "pacePolicyId",
          "policyCode", "authorisedByUserId", "reason", "expiresAt"
        ) VALUES (
          ${childOverrideId}, ${fixture.tenantAId}, ${fixture.childAId},
          ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
          ${fixture.actorAId}, 'Child-scoped exception', ${futureExpiry}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "PacePolicyOverride" (
          "id", "tenantId", "childId", "subjectId", "pacePolicyId",
          "policyCode", "authorisedByUserId", "reason", "expiresAt"
        ) VALUES (
          ${subjectOverrideId}, ${fixture.tenantAId}, ${fixture.childAId},
          ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
          ${fixture.actorAId}, 'Subject-scoped exception', ${futureExpiry}
        )
      `;
    });

    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, {
            childId: fixture.childA2Id,
            policyOverrideId: childOverrideId,
          }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, {
            subjectId: fixture.subjectA2Id,
            policyOverrideId: subjectOverrideId,
          }),
        ),
      "23503",
    );
  });

  it("rejects PaceProgress linked to another child or subject in the same tenant", async () => {
    if (!isDatabaseAvailable()) return;

    const assessmentId = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPaceAssessment(tx, fixture),
    );

    for (const [childId, subjectId] of [
      [fixture.childA2Id, fixture.subjectAId],
      [fixture.childAId, fixture.subjectA2Id],
    ] as const) {
      await expectDatabaseRejection(
        () =>
          withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
            tx.$executeRaw`
              INSERT INTO "PaceProgress" (
                "id", "tenantId", "childId", "subjectId", "currentPace",
                "targetPace", "completedPaces", "trackStatus",
                "lastAssessmentId", "rebuiltAt"
              ) VALUES (
                ${randomUUID()}, ${fixture.tenantAId}, ${childId}, ${subjectId},
                101, 110, 1, 'ON_TRACK', ${assessmentId},
                ${new Date("2026-09-16T00:00:00.000Z")}
              )
            `,
          ),
        "23503",
      );
    }
  });

  it("keeps policy override facts immutable", async () => {
    if (!isDatabaseAvailable()) return;

    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const forgedCreatedAt = new Date(Date.now() - 60 * 60 * 1000);
    const earliestExpectedCreatedAt = new Date(Date.now() - 1000);
    const { pacePolicyId, demeritPolicyId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPolicies(tx, fixture),
    );
    const paceOverrideId = randomUUID();
    const demeritOverrideId = randomUUID();

    await withPaceRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "PacePolicyOverride" (
          "id", "tenantId", "childId", "subjectId", "pacePolicyId",
          "policyCode", "authorisedByUserId", "reason", "createdAt",
          "expiresAt"
        ) VALUES (
          ${paceOverrideId}, ${fixture.tenantAId}, ${fixture.childAId},
          ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
          ${fixture.actorAId}, 'Approved exception', ${forgedCreatedAt},
          ${futureExpiry}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "DemeritStageOverride" (
          "id", "tenantId", "childId", "demeritPolicyId", "stage",
          "authorisedByUserId", "reason", "createdAt", "expiresAt"
        ) VALUES (
          ${demeritOverrideId}, ${fixture.tenantAId}, ${fixture.childAId},
          ${demeritPolicyId}, 2, ${fixture.actorAId}, 'Manual stage',
          ${forgedCreatedAt}, ${futureExpiry}
        )
      `;
    });

    const latestExpectedCreatedAt = new Date(Date.now() + 1000);
    const [paceOverride] = await prisma.$queryRaw<Array<{ createdAt: Date }>>`
      SELECT "createdAt" FROM "PacePolicyOverride" WHERE "id" = ${paceOverrideId}
    `;
    const [demeritOverride] = await prisma.$queryRaw<
      Array<{ createdAt: Date }>
    >`
      SELECT "createdAt" FROM "DemeritStageOverride" WHERE "id" = ${demeritOverrideId}
    `;

    for (const override of [paceOverride, demeritOverride]) {
      expect(override.createdAt.getTime()).toBeGreaterThanOrEqual(
        earliestExpectedCreatedAt.getTime(),
      );
      expect(override.createdAt.getTime()).toBeLessThanOrEqual(
        latestExpectedCreatedAt.getTime(),
      );
    }

    for (const operation of [
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`UPDATE "PacePolicyOverride" SET "reason" = 'Changed' WHERE "id" = ${paceOverrideId}`,
        ),
      () =>
        withPaceRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`UPDATE "DemeritStageOverride" SET "reason" = 'Changed' WHERE "id" = ${demeritOverrideId}`,
        ),
    ]) {
      await expectDatabaseRejection(operation, "55000");
    }
  });

  it("rejects cross-tenant and cross-subject correction swaps", async () => {
    if (!isDatabaseAvailable()) return;

    const { assessmentId, behaviourEntryId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => ({
        assessmentId: await insertPaceAssessment(tx, fixture),
        behaviourEntryId: await insertBehaviourEntry(tx, fixture),
      }),
    );

    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, { childId: fixture.childBId }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantBId, fixture.orgBId, (tx) =>
          insertPaceAssessment(tx, fixture, {
            tenantId: fixture.tenantBId,
            childId: fixture.childBId,
            subjectId: fixture.subjectBId,
            actorId: fixture.actorBId,
            correctsAssessmentId: assessmentId,
          }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, { actorId: fixture.actorBId }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, {
            childId: fixture.childA2Id,
            correctsAssessmentId: assessmentId,
          }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertPaceAssessment(tx, fixture, {
            subjectId: fixture.subjectA2Id,
            correctsAssessmentId: assessmentId,
          }),
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withPaceRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertBehaviourEntry(tx, fixture, {
            childId: fixture.childA2Id,
            correctsBehaviourEntryId: behaviourEntryId,
          }),
        ),
      "23503",
    );
  });

  it("stores BehaviourEntry.note encrypted at rest and decrypts it through Prisma", async () => {
    if (!isDatabaseAvailable()) return;

    const plaintext = "Sensitive pastoral context";
    const result = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const created = await tx.behaviourEntry.create({
          data: {
            tenantId: fixture.tenantAId,
            childId: fixture.childAId,
            type: "GENERAL",
            visibility: "SENSITIVE",
            category: "pastoral",
            pointsDelta: 0,
            occurredAt: new Date("2026-09-16T09:30:00.000Z"),
            recordedByUserId: fixture.actorAId,
            reason: "Recorded sensitive context",
            note: plaintext,
          },
        });
        const [stored] = await tx.$queryRaw<Array<{ note: string }>>`
          SELECT "note" FROM "BehaviourEntry" WHERE "id" = ${created.id}
        `;
        const read = await tx.behaviourEntry.findUniqueOrThrow({
          where: { id: created.id },
        });
        return { atRest: stored.note, throughClient: read.note };
      },
    );

    expect(result.atRest).not.toBe(plaintext);
    expect(isEncryptedField(result.atRest)).toBe(true);
    expect(result.throughClient).toBe(plaintext);
  });

  it("isolates all PACE and behaviour tables with forced tenant RLS", async () => {
    if (!isDatabaseAvailable()) return;

    const futureExpiry = new Date(Date.now() + 60 * 60 * 1000);
    const { pacePolicyId, demeritPolicyId } = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPolicies(tx, fixture),
    );
    const assessmentId = await withPaceRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertPaceAssessment(tx, fixture),
    );
    await withPaceRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertBehaviourEntry(tx, fixture);
      await tx.$executeRaw`
        INSERT INTO "PaceProgress" (
          "id", "tenantId", "childId", "subjectId", "currentPace", "targetPace",
          "completedPaces", "trackStatus", "lastAssessmentId", "rebuiltAt"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
          ${fixture.subjectAId}, 101, 110, 1, 'ON_TRACK', ${assessmentId},
          ${new Date("2026-09-16T00:00:00.000Z")}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "PacePolicyOverride" (
          "id", "tenantId", "childId", "subjectId", "pacePolicyId",
          "policyCode", "authorisedByUserId", "reason", "expiresAt"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
          ${fixture.subjectAId}, ${pacePolicyId}, 'daily-limit',
          ${fixture.actorAId}, 'Approved exception',
          ${futureExpiry}
        )
      `;
      await tx.$executeRaw`
        INSERT INTO "DemeritStageOverride" (
          "id", "tenantId", "childId", "demeritPolicyId", "stage",
          "authorisedByUserId", "reason", "expiresAt"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${fixture.childAId},
          ${demeritPolicyId}, 2, ${fixture.actorAId}, 'Manual stage',
          ${futureExpiry}
        )
      `;
    });

    const visibleCounts = await withPaceRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            paceAssessment: bigint;
            paceProgress: bigint;
            pacePolicy: bigint;
            pacePolicyOverride: bigint;
            behaviourEntry: bigint;
            demeritPolicy: bigint;
            demeritStageOverride: bigint;
          }>
        >`
          SELECT
            (SELECT count(*) FROM "PaceAssessment") AS "paceAssessment",
            (SELECT count(*) FROM "PaceProgress") AS "paceProgress",
            (SELECT count(*) FROM "PacePolicy") AS "pacePolicy",
            (SELECT count(*) FROM "PacePolicyOverride") AS "pacePolicyOverride",
            (SELECT count(*) FROM "BehaviourEntry") AS "behaviourEntry",
            (SELECT count(*) FROM "DemeritPolicy") AS "demeritPolicy",
            (SELECT count(*) FROM "DemeritStageOverride") AS "demeritStageOverride"
        `,
    );

    expect(visibleCounts).toEqual([
      {
        paceAssessment: 0n,
        paceProgress: 0n,
        pacePolicy: 0n,
        pacePolicyOverride: 0n,
        behaviourEntry: 0n,
        demeritPolicy: 0n,
        demeritStageOverride: 0n,
      },
    ]);
  });
});
