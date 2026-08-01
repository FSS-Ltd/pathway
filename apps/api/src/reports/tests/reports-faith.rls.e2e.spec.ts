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

interface ReportsFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  childAId: string;
  childA2Id: string;
  childBId: string;
  periodAId: string;
  periodBId: string;
  authorUserId: string;
  reviewerUserId: string;
  fullGuardianUserId: string;
  limitedGuardianUserId: string;
  studentUserId: string;
  unrelatedUserId: string;
}

interface DraftFixture {
  reportId: string;
  compilationId: string;
  draftId: string;
}

interface ReportVersionRow {
  id: string;
  reportId: string;
  sourceDraftId: string;
  versionNumber: number;
  familyPayload: Prisma.JsonValue;
  privateDocumentKey: string | null;
  guardianVisibleAt: Date;
  studentVisibleAt: Date | null;
  supersedesVersionId: string | null;
}

interface BlockedApprovalSession {
  applicationName: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withReportsRlsContext<T>(
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

async function createDraftFixture(
  tx: Prisma.TransactionClient,
  fixture: ReportsFixture,
  status: "DRAFT" | "IN_REVIEW" = "DRAFT",
  existingReportId?: string,
): Promise<DraftFixture> {
  const reportId = existingReportId ?? randomUUID();
  const compilationId = randomUUID();
  const draftId = randomUUID();
  if (!existingReportId) {
    await tx.$executeRaw`
      INSERT INTO "AceTermReport" (
        "id", "tenantId", "childId", "academicPeriodId"
      ) VALUES (
        ${reportId}, ${fixture.tenantAId}, ${fixture.childAId}, ${fixture.periodAId}
      )
    `;
  }
  await tx.$executeRaw`
    INSERT INTO "AceReportCompilation" (
      "id", "tenantId", "reportId", "sourceEncrypted", "compiledByUserId"
    ) VALUES (
      ${compilationId}, ${fixture.tenantAId}, ${reportId},
      ${"enc:test-source"}, ${fixture.authorUserId}
    )
  `;
  await tx.$executeRaw`
    INSERT INTO "AceReportDraft" (
      "id", "tenantId", "reportId", "compilationId", "familyPayload",
      "staffNotesEncrypted", "status", "authorUserId", "submittedAt"
    ) VALUES (
      ${draftId}, ${fixture.tenantAId}, ${reportId}, ${compilationId},
      ${JSON.stringify({ summary: "Steady progress" })}::jsonb,
      ${"enc:staff-note"}, ${status}::"AceReportDraftStatus", ${fixture.authorUserId},
      ${status === "IN_REVIEW" ? new Date() : null}
    )
  `;
  return { reportId, compilationId, draftId };
}

async function submitDraft(
  tx: Prisma.TransactionClient,
  draftId: string,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "AceReportDraft"
    SET "status" = 'IN_REVIEW', "submittedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${draftId}
  `;
}

async function approveReport(
  tx: Prisma.TransactionClient,
  options: { tenantId: string; draftId: string; reviewerUserId: string },
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "AceReportReview" (
      "id", "tenantId", "draftId", "reviewerUserId", "decision",
      "reviewNotesEncrypted"
    ) VALUES (
      ${randomUUID()}, ${options.tenantId}, ${options.draftId},
      ${options.reviewerUserId}, 'APPROVED', ${"enc:approved"}
    )
  `;
}

async function waitForBlockedApprovalSessions(
  applicationNames: string[],
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const blocked = await prisma.$queryRaw<BlockedApprovalSession[]>`
      SELECT "application_name" AS "applicationName"
      FROM pg_catalog.pg_stat_activity
      WHERE "application_name" LIKE 'ace-report-approval-%'
        AND "wait_event_type" = 'Lock'
    `;
    const blockedApplicationNames = new Set(
      blocked.map(({ applicationName }) => applicationName),
    );
    if (applicationNames.every((name) => blockedApplicationNames.has(name))) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    "Both approval transactions did not block on the report serialization lock",
  );
}

async function getReportVersion(
  tx: Prisma.TransactionClient,
  reportId: string,
): Promise<ReportVersionRow> {
  const [version] = await tx.$queryRaw<ReportVersionRow[]>`
    SELECT
      "id", "reportId", "sourceDraftId", "versionNumber", "familyPayload",
      "privateDocumentKey", "guardianVisibleAt", "studentVisibleAt",
      "supersedesVersionId"
    FROM "AceTermReportVersion"
    WHERE "reportId" = ${reportId}
    ORDER BY "versionNumber" DESC
    LIMIT 1
  `;
  if (!version) throw new Error("Expected a published report version");
  return version;
}

async function publishReport(
  fixture: ReportsFixture,
): Promise<{ draft: DraftFixture; version: ReportVersionRow }> {
  const draft = await withReportsRlsContext(
    fixture.tenantAId,
    fixture.orgAId,
    async (tx) => {
      const created = await createDraftFixture(tx, fixture);
      await submitDraft(tx, created.draftId);
      return created;
    },
  );
  await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
    approveReport(tx, {
      tenantId: fixture.tenantAId,
      draftId: draft.draftId,
      reviewerUserId: fixture.reviewerUserId,
    }),
  );
  const version = await withReportsRlsContext(
    fixture.tenantAId,
    fixture.orgAId,
    (tx) => getReportVersion(tx, draft.reportId),
  );
  return { draft, version };
}

async function deleteReportRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."AceTermReport"')::text AS "exists"
  `;
  if (!row?.exists) return;
  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AceTermReportVersion",
      "AceReportReview",
      "AceReportDraft",
      "AceReportCompilation",
      "AceTermReport"
  `);
}

describe("ACE report publication storage", () => {
  let fixture: ReportsFixture;

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
      periodAId: randomUUID(),
      periodBId: randomUUID(),
      authorUserId: randomUUID(),
      reviewerUserId: randomUUID(),
      fullGuardianUserId: randomUUID(),
      limitedGuardianUserId: randomUUID(),
      studentUserId: randomUUID(),
      unrelatedUserId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        { id: fixture.orgAId, name: "Reports org A", slug: `reports-a-${fixture.orgAId}`, planCode: "trial" },
        { id: fixture.orgBId, name: "Reports org B", slug: `reports-b-${fixture.orgBId}`, planCode: "trial" },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: fixture.tenantAId, orgId: fixture.orgAId, name: "Reports tenant A", slug: `reports-a-${fixture.tenantAId}` },
        { id: fixture.tenantBId, orgId: fixture.orgBId, name: "Reports tenant B", slug: `reports-b-${fixture.tenantBId}` },
      ],
    });
    await prisma.user.createMany({
      data: [
        fixture.authorUserId,
        fixture.reviewerUserId,
        fixture.fullGuardianUserId,
        fixture.limitedGuardianUserId,
        fixture.studentUserId,
        fixture.unrelatedUserId,
      ].map((id) => ({ id, email: `${id}@example.test` })),
    });
    await prisma.siteMembership.createMany({
      data: [fixture.authorUserId, fixture.reviewerUserId].map((userId) => ({
        id: randomUUID(),
        tenantId: fixture.tenantAId,
        userId,
      })),
    });

    await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await tx.child.createMany({
        data: [
          { id: fixture.childAId, tenantId: fixture.tenantAId, firstName: "Report", lastName: "Child A" },
          { id: fixture.childA2Id, tenantId: fixture.tenantAId, firstName: "Report", lastName: "Child A2" },
        ],
      });
      const year = await tx.academicYear.create({
        data: {
          tenantId: fixture.tenantAId,
          name: "2026/27",
          startsOn: new Date("2026-09-01T00:00:00.000Z"),
          endsOn: new Date("2027-08-31T00:00:00.000Z"),
        },
      });
      await tx.academicPeriod.create({
        data: {
          id: fixture.periodAId,
          tenantId: fixture.tenantAId,
          academicYearId: year.id,
          name: "Autumn",
          startsOn: new Date("2026-09-01T00:00:00.000Z"),
          endsOn: new Date("2026-12-18T00:00:00.000Z"),
        },
      });

      const fullGuardianIdentityId = randomUUID();
      const limitedGuardianIdentityId = randomUUID();
      const studentIdentityId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "StudentPortalPolicy" ("tenantId", "studentPortalEnabled")
        VALUES (${fixture.tenantAId}, true)
      `;
      await tx.$executeRaw`
        INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId") VALUES
          (${fullGuardianIdentityId}, ${fixture.tenantAId}, ${fixture.fullGuardianUserId}),
          (${limitedGuardianIdentityId}, ${fixture.tenantAId}, ${fixture.limitedGuardianUserId})
      `;
      await tx.$executeRaw`
        INSERT INTO "GuardianChildRelationship" (
          "id", "tenantId", "guardianIdentityId", "childId", "legalAccess"
        ) VALUES
          (${randomUUID()}, ${fixture.tenantAId}, ${fullGuardianIdentityId}, ${fixture.childAId}, 'FULL'),
          (${randomUUID()}, ${fixture.tenantAId}, ${limitedGuardianIdentityId}, ${fixture.childAId}, 'LIMITED')
      `;
      await tx.$executeRaw`
        INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
        VALUES (${studentIdentityId}, ${fixture.tenantAId}, ${fixture.studentUserId})
      `;
      await tx.$executeRaw`
        INSERT INTO "StudentIdentityLink" (
          "id", "tenantId", "studentIdentityId", "childId"
        ) VALUES (${randomUUID()}, ${fixture.tenantAId}, ${studentIdentityId}, ${fixture.childAId})
      `;
    });

    await withReportsRlsContext(fixture.tenantBId, fixture.orgBId, async (tx) => {
      await tx.child.create({
        data: { id: fixture.childBId, tenantId: fixture.tenantBId, firstName: "Report", lastName: "Child B" },
      });
      const year = await tx.academicYear.create({
        data: {
          tenantId: fixture.tenantBId,
          name: "2026/27",
          startsOn: new Date("2026-09-01T00:00:00.000Z"),
          endsOn: new Date("2027-08-31T00:00:00.000Z"),
        },
      });
      await tx.academicPeriod.create({
        data: {
          id: fixture.periodBId,
          tenantId: fixture.tenantBId,
          academicYearId: year.id,
          name: "Autumn",
          startsOn: new Date("2026-09-01T00:00:00.000Z"),
          endsOn: new Date("2026-12-18T00:00:00.000Z"),
        },
      });
    });
  });

  afterEach(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteReportRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteReportRowsIfPresent(prisma);
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        "StudentIdentityLink",
        "GuardianChildRelationship",
        "FamilyIdentityInvite",
        "GuardianIdentity",
        "StudentIdentity",
        "StudentPortalPolicy"
    `);
    await prisma.academicPeriod.deleteMany({ where: { id: { in: [fixture.periodAId, fixture.periodBId] } } });
    await prisma.academicYear.deleteMany({ where: { tenantId: { in: [fixture.tenantAId, fixture.tenantBId] } } });
    await prisma.child.deleteMany({ where: { id: { in: [fixture.childAId, fixture.childA2Id, fixture.childBId] } } });
    await prisma.siteMembership.deleteMany({ where: { tenantId: fixture.tenantAId } });
    await prisma.user.deleteMany({ where: { id: { in: [fixture.authorUserId, fixture.reviewerUserId, fixture.fullGuardianUserId, fixture.limitedGuardianUserId, fixture.studentUserId, fixture.unrelatedUserId] } } });
    await prisma.tenant.deleteMany({ where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } } });
    await prisma.org.deleteMany({ where: { id: { in: [fixture.orgAId, fixture.orgBId] } } });
  });

  it("rejects approval by the report author", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      createDraftFixture(tx, fixture, "IN_REVIEW"),
    );
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        approveReport(tx, { tenantId: fixture.tenantAId, draftId: draft.draftId, reviewerUserId: fixture.authorUserId }),
      ),
      "23514",
    );
  });

  it("requires review submission before approval", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      createDraftFixture(tx, fixture),
    );
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        approveReport(tx, { tenantId: fixture.tenantAId, draftId: draft.draftId, reviewerUserId: fixture.reviewerUserId }),
      ),
      "23514",
    );
  });

  it("rejects a report compiler outside the tenant", async () => {
    if (!isDatabaseAvailable()) return;
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
        const reportId = randomUUID();
        await tx.$executeRaw`
          INSERT INTO "AceTermReport" ("id", "tenantId", "childId", "academicPeriodId")
          VALUES (${reportId}, ${fixture.tenantAId}, ${fixture.childAId}, ${fixture.periodAId})
        `;
        await tx.$executeRaw`
          INSERT INTO "AceReportCompilation" (
            "id", "tenantId", "reportId", "sourceEncrypted", "compiledByUserId"
          ) VALUES (
            ${randomUUID()}, ${fixture.tenantAId}, ${reportId},
            ${"enc:source"}, ${fixture.unrelatedUserId}
          )
        `;
      }),
      "23503",
    );
  });

  it("rejects a report author outside the tenant", async () => {
    if (!isDatabaseAvailable()) return;
    const source = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture),
    );
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
        INSERT INTO "AceReportDraft" (
          "id", "tenantId", "reportId", "compilationId", "familyPayload",
          "status", "authorUserId"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${source.reportId},
          ${source.compilationId}, ${JSON.stringify({ summary: "Bypass" })}::jsonb,
          'DRAFT', ${fixture.unrelatedUserId}
        )
      `),
      "23503",
    );
  });

  it("rejects a report reviewer outside the tenant", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture, "IN_REVIEW"),
    );
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
        approveReport(tx, {
          tenantId: fixture.tenantAId,
          draftId: draft.draftId,
          reviewerUserId: fixture.unrelatedUserId,
        }),
      ),
      "23503",
    );
  });

  it("rejects approval and publication attempted from an unrelated nested trigger", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture, "IN_REVIEW"),
    );
    const versionId = randomUUID();
    await prisma.$executeRawUnsafe(`
      CREATE TABLE app."AceReportPublicationBypassProbe" (
        "draftId" TEXT NOT NULL,
        "versionId" TEXT NOT NULL
      )
    `);
    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION app.attempt_ace_report_publication_bypass()
      RETURNS trigger
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = ''
      AS $probe$
      BEGIN
        UPDATE app."AceReportDraft"
        SET "status" = 'APPROVED', "approvedAt" = CURRENT_TIMESTAMP
        WHERE "id" = NEW."draftId";

        INSERT INTO app."AceTermReportVersion" (
          "id", "tenantId", "reportId", "sourceDraftId", "versionNumber",
          "familyPayload", "privateDocumentKey", "guardianVisibleAt"
        )
        SELECT
          NEW."versionId", "tenantId", "reportId", "id", 99,
          "familyPayload",
          'tenants/' || "tenantId" || '/reports/' || NEW."versionId" || '.pdf',
          CURRENT_TIMESTAMP
        FROM app."AceReportDraft"
        WHERE "id" = NEW."draftId";
        RETURN NEW;
      END;
      $probe$
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER "AceReportPublicationBypassProbe_attempt"
      AFTER INSERT ON app."AceReportPublicationBypassProbe"
      FOR EACH ROW EXECUTE FUNCTION app.attempt_ace_report_publication_bypass()
    `);
    await prisma.$executeRawUnsafe(`
      GRANT INSERT ON app."AceReportPublicationBypassProbe" TO "${TENANT_RLS_ROLE}"
    `);

    try {
      await expectDatabaseRejection(
        () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
          INSERT INTO "AceReportPublicationBypassProbe" ("draftId", "versionId")
          VALUES (${draft.draftId}, ${versionId})
        `),
        "23514",
      );
    } finally {
      await prisma.$executeRawUnsafe(
        'DROP TABLE IF EXISTS app."AceReportPublicationBypassProbe"',
      );
      await prisma.$executeRawUnsafe(
        "DROP FUNCTION IF EXISTS app.attempt_ace_report_publication_bypass()",
      );
    }
  });

  it("publishes one guardian-visible version with no student release", async () => {
    if (!isDatabaseAvailable()) return;
    const { draft, version } = await publishReport(fixture);
    expect(version).toMatchObject({
      reportId: draft.reportId,
      sourceDraftId: draft.draftId,
      versionNumber: 1,
      familyPayload: { summary: "Steady progress" },
      studentVisibleAt: null,
      supersedesVersionId: null,
    });
    expect(Number.isNaN(version.guardianVisibleAt.getTime())).toBe(false);
    expect(version.privateDocumentKey).toBe(
      `tenants/${fixture.tenantAId}/reports/${version.id}.pdf`,
    );

    const [facts] = await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      tx.$queryRaw<Array<{ fullGuardians: bigint; limitedGuardians: bigint; activeStudents: bigint; unrelatedLinks: bigint }>>`
        SELECT
          (SELECT count(*) FROM "GuardianChildRelationship" WHERE "childId" = ${fixture.childAId} AND "legalAccess" = 'FULL' AND "endedAt" IS NULL AND "revokedAt" IS NULL) AS "fullGuardians",
          (SELECT count(*) FROM "GuardianChildRelationship" WHERE "childId" = ${fixture.childAId} AND "legalAccess" = 'LIMITED' AND "endedAt" IS NULL AND "revokedAt" IS NULL) AS "limitedGuardians",
          (SELECT count(*) FROM "StudentIdentityLink" WHERE "childId" = ${fixture.childAId} AND "endedAt" IS NULL AND "revokedAt" IS NULL) AS "activeStudents",
          (SELECT count(*) FROM "StudentIdentity" WHERE "userId" = ${fixture.unrelatedUserId}) AS "unrelatedLinks"
      `,
    );
    expect(facts).toEqual({ fullGuardians: 1n, limitedGuardians: 1n, activeStudents: 1n, unrelatedLinks: 0n });
  });

  it("rejects direct publication and mutations of released data", async () => {
    if (!isDatabaseAvailable()) return;
    const { draft, version } = await publishReport(fixture);
    const mutationStatements = [
      `UPDATE "AceTermReportVersion" SET "familyPayload" = '{"changed":true}'::jsonb WHERE "id" = '${version.id}'`,
      `UPDATE "AceTermReportVersion" SET "reportId" = '${randomUUID()}' WHERE "id" = '${version.id}'`,
      `UPDATE "AceTermReportVersion" SET "sourceDraftId" = '${randomUUID()}' WHERE "id" = '${version.id}'`,
      `UPDATE "AceTermReportVersion" SET "supersedesVersionId" = '${randomUUID()}' WHERE "id" = '${version.id}'`,
      `UPDATE "AceTermReportVersion" SET "privateDocumentKey" = 'public/report.pdf' WHERE "id" = '${version.id}'`,
      `DELETE FROM "AceTermReportVersion" WHERE "id" = '${version.id}'`,
    ];
    for (const statement of mutationStatements) {
      await expectDatabaseRejection(
        () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRawUnsafe(statement)),
        "55000",
      );
    }

    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
        INSERT INTO "AceTermReportVersion" (
          "id", "tenantId", "reportId", "sourceDraftId", "versionNumber",
          "familyPayload", "guardianVisibleAt"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${draft.reportId}, ${draft.draftId},
          99, ${JSON.stringify({ bypass: true })}::jsonb, CURRENT_TIMESTAMP
        )
      `),
      "55000",
    );
  });

  it("creates one ordered successor version for a correction", async () => {
    if (!isDatabaseAvailable()) return;
    const first = await publishReport(fixture);
    const correction = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const draft = await createDraftFixture(
          tx,
          fixture,
          "DRAFT",
          first.draft.reportId,
        );
        await submitDraft(tx, draft.draftId);
        return draft;
      },
    );
    await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      approveReport(tx, {
        tenantId: fixture.tenantAId,
        draftId: correction.draftId,
        reviewerUserId: fixture.reviewerUserId,
      }),
    );

    const versions = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<ReportVersionRow[]>`
        SELECT
          "id", "reportId", "sourceDraftId", "versionNumber", "familyPayload",
          "privateDocumentKey", "guardianVisibleAt", "studentVisibleAt",
          "supersedesVersionId"
        FROM "AceTermReportVersion"
        WHERE "reportId" = ${first.draft.reportId}
        ORDER BY "versionNumber"
      `,
    );
    expect(versions).toHaveLength(2);
    expect(versions[1]).toMatchObject({
      sourceDraftId: correction.draftId,
      versionNumber: 2,
      supersedesVersionId: first.version.id,
    });
  });

  it("serializes concurrent correction approvals into one supersession chain", async () => {
    if (!isDatabaseAvailable()) return;
    const first = await publishReport(fixture);
    const corrections = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const drafts = await Promise.all([
          createDraftFixture(tx, fixture, "DRAFT", first.draft.reportId),
          createDraftFixture(tx, fixture, "DRAFT", first.draft.reportId),
        ]);
        for (const draft of drafts) await submitDraft(tx, draft.draftId);
        return drafts;
      },
    );

    let releaseReportLock = (): void => undefined;
    let reportLockAcquired = (): void => undefined;
    const releaseReportLockPromise = new Promise<void>((resolve) => {
      releaseReportLock = resolve;
    });
    const reportLockAcquiredPromise = new Promise<void>((resolve) => {
      reportLockAcquired = resolve;
    });
    const reportLock = withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.$queryRaw`
          SELECT "id"
          FROM "AceTermReport"
          WHERE "id" = ${first.draft.reportId}
          FOR NO KEY UPDATE
        `;
        reportLockAcquired();
        await releaseReportLockPromise;
      },
    );
    await reportLockAcquiredPromise;

    const applicationNames = corrections.map(
      () => `ace-report-approval-${randomUUID()}`,
    );
    const approvals = corrections.map((draft, index) =>
      withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
        await tx.$executeRaw`
          SELECT pg_catalog.set_config(
            'application_name', ${applicationNames[index] ?? ""}, true
          )
        `;
        await approveReport(tx, {
          tenantId: fixture.tenantAId,
          draftId: draft.draftId,
          reviewerUserId: fixture.reviewerUserId,
        });
      }),
    );
    const approvalResultsPromise = Promise.allSettled(approvals);

    let lockObservationError: unknown;
    try {
      await waitForBlockedApprovalSessions(applicationNames);
    } catch (error) {
      lockObservationError = error;
    } finally {
      releaseReportLock();
      await reportLock;
    }
    const approvalResults = await approvalResultsPromise;
    if (lockObservationError) throw lockObservationError;
    const failedApproval = approvalResults.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (failedApproval) throw failedApproval.reason;

    const versions = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<Array<Pick<ReportVersionRow, "id" | "sourceDraftId" | "versionNumber" | "supersedesVersionId">>>`
        SELECT "id", "sourceDraftId", "versionNumber", "supersedesVersionId"
        FROM "AceTermReportVersion"
        WHERE "reportId" = ${first.draft.reportId}
        ORDER BY "versionNumber"
      `,
    );
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2, 3]);
    expect(versions[1]?.supersedesVersionId).toBe(versions[0]?.id);
    expect(versions[2]?.supersedesVersionId).toBe(versions[1]?.id);
    expect(new Set(versions.slice(1).map((version) => version.sourceDraftId))).toEqual(
      new Set(corrections.map((draft) => draft.draftId)),
    );
  });

  it("allows one explicit student release without opening published content", async () => {
    if (!isDatabaseAvailable()) return;
    const { version } = await publishReport(fixture);
    const releasedAt = new Date("2026-12-20T12:00:00.000Z");
    await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
      UPDATE "AceTermReportVersion"
      SET "studentVisibleAt" = ${releasedAt}
      WHERE "id" = ${version.id}
    `);
    const updated = await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => getReportVersion(tx, version.reportId));
    expect(updated.studentVisibleAt).toEqual(releasedAt);
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
        UPDATE "AceTermReportVersion"
        SET "studentVisibleAt" = ${new Date("2026-12-21T12:00:00.000Z")}
        WHERE "id" = ${version.id}
      `),
      "55000",
    );
  });

  it("rejects report target changes and cross-tenant targets", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => createDraftFixture(tx, fixture));
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
        UPDATE "AceTermReport" SET "childId" = ${fixture.childA2Id} WHERE "id" = ${draft.reportId}
      `),
      "55000",
    );
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
        INSERT INTO "AceTermReport" ("id", "tenantId", "childId", "academicPeriodId")
        VALUES (${randomUUID()}, ${fixture.tenantAId}, ${fixture.childBId}, ${fixture.periodAId})
      `),
      "23503",
    );
    await expectDatabaseRejection(
      () => withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) => tx.$executeRaw`
        INSERT INTO "AceTermReport" ("id", "tenantId", "childId", "academicPeriodId")
        VALUES (${randomUUID()}, ${fixture.tenantAId}, ${fixture.childA2Id}, ${fixture.periodBId})
      `),
      "23503",
    );
  });

  it("fails closed under forced tenant RLS", async () => {
    if (!isDatabaseAvailable()) return;
    await publishReport(fixture);
    const tenantBCounts = await withReportsRlsContext(fixture.tenantBId, fixture.orgBId, (tx) => tx.$queryRaw<Array<{ reports: bigint; compilations: bigint; drafts: bigint; reviews: bigint; versions: bigint }>>`
      SELECT
        (SELECT count(*) FROM "AceTermReport") AS "reports",
        (SELECT count(*) FROM "AceReportCompilation") AS "compilations",
        (SELECT count(*) FROM "AceReportDraft") AS "drafts",
        (SELECT count(*) FROM "AceReportReview") AS "reviews",
        (SELECT count(*) FROM "AceTermReportVersion") AS "versions"
    `);
    expect(tenantBCounts).toEqual([{ reports: 0n, compilations: 0n, drafts: 0n, reviews: 0n, versions: 0n }]);
  });
});
