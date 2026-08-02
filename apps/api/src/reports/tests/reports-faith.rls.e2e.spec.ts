import { randomUUID } from "node:crypto";
import {
  Prisma,
  PrismaClient,
  prisma,
  withTenantRlsContext,
  type PrismaClientType,
} from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";
const F18_TABLES = [
  "AceTermReport",
  "AceReportCompilation",
  "AceReportDraft",
  "AceReportReview",
  "AceTermReportVersion",
  "FaithAgeBand",
  "FaithContent",
  "FaithContentDraft",
  "FaithContentVersion",
  "FaithContentAudience",
  "FaithReadReceipt",
  "FaithReflection",
] as const;

interface CountRow {
  count: number;
}

interface ReportsFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  childAId: string;
  childA2Id: string;
  childA3Id: string;
  childBId: string;
  periodAId: string;
  periodBId: string;
  authorUserId: string;
  reviewerUserId: string;
  fullGuardianUserId: string;
  limitedGuardianUserId: string;
  endedGuardianUserId: string;
  studentUserId: string;
  ineligibleStudentUserId: string;
  noDobStudentUserId: string;
  tenantBStudentUserId: string;
  unrelatedUserId: string;
  studentIdentityId: string;
  ineligibleStudentIdentityId: string;
  noDobStudentIdentityId: string;
  tenantBStudentIdentityId: string;
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

interface ReportPiiRow {
  sourceEncrypted: string;
  staffNotesEncrypted: string | null;
  reviewNotesEncrypted: string | null;
}

interface ReportPublisherSecurityRow {
  functionOwner: string;
  securityDefiner: boolean;
  broadExecuteRevoked: boolean;
  legitimateTriggerInstalled: boolean;
  schemaUsageGranted: boolean;
  schemaCreateRevoked: boolean;
  minimalTablePrivileges: boolean;
  isolatedRole: boolean;
}

interface BlockedApprovalSession {
  applicationName: string;
}

interface FaithAgeBandFixture {
  id: string;
  tenantId: string;
  name: string;
  minimumAge: number;
  maximumAge: number;
}

interface FaithContentFixture {
  contentId: string;
  draftId: string;
  versionId: string;
}

interface FaithAudienceRow {
  type: "ALL_ACTIVE_STUDENTS" | "AGE_BAND";
  sourceAgeBandId: string | null;
  ageBandName: string | null;
  minimumAge: number | null;
  maximumAge: number | null;
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
  observer: PrismaClient,
  applicationNames: string[],
): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const blocked = await observer.$queryRaw<BlockedApprovalSession[]>`
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

async function deleteFaithRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."FaithContent"')::text AS "exists"
  `;
  if (!row?.exists) return;
  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "FaithReflection",
      "FaithReadReceipt",
      "FaithContentAudience",
      "FaithContentVersion",
      "FaithContentDraft",
      "FaithContent",
      "FaithAgeBand"
  `);
}

async function createFaithAgeBand(
  tx: Prisma.TransactionClient,
  ageBand: FaithAgeBandFixture,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "FaithAgeBand" (
      "id", "tenantId", "name", "minimumAge", "maximumAge"
    ) VALUES (
      ${ageBand.id}, ${ageBand.tenantId}, ${ageBand.name},
      ${ageBand.minimumAge}, ${ageBand.maximumAge}
    )
  `;
}

async function createFaithDraft(
  tx: Prisma.TransactionClient,
  fixture: ReportsFixture,
  authorUserId = fixture.authorUserId,
): Promise<Omit<FaithContentFixture, "versionId">> {
  const contentId = randomUUID();
  const draftId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "FaithContent" ("id", "tenantId")
    VALUES (${contentId}, ${fixture.tenantAId})
  `;
  await tx.$executeRaw`
    INSERT INTO "FaithContentDraft" (
      "id", "tenantId", "faithContentId", "title", "contentPayload",
      "status", "authorUserId"
    ) VALUES (
      ${draftId}, ${fixture.tenantAId}, ${contentId}, ${"Walking in wisdom"},
      ${JSON.stringify({ body: "Choose wisdom today" })}::jsonb,
      'DRAFT', ${authorUserId}
    )
  `;
  return { contentId, draftId };
}

async function insertFaithVersion(
  tx: Prisma.TransactionClient,
  fixture: ReportsFixture,
  draft: Omit<FaithContentFixture, "versionId">,
  versionId = randomUUID(),
): Promise<string> {
  await tx.$executeRaw`
    INSERT INTO "FaithContentVersion" (
      "id", "tenantId", "faithContentId", "sourceDraftId",
      "versionNumber", "title", "contentPayload", "publishedAt"
    ) VALUES (
      ${versionId}, ${fixture.tenantAId}, ${draft.contentId}, ${draft.draftId},
      1, ${"Walking in wisdom"},
      ${JSON.stringify({ body: "Choose wisdom today" })}::jsonb,
      ${new Date("2026-08-01T09:00:00.000Z")}
    )
  `;
  return versionId;
}

async function insertFaithAudience(
  tx: Prisma.TransactionClient,
  options: {
    fixture: ReportsFixture;
    versionId: string;
    type: "ALL_ACTIVE_STUDENTS" | "AGE_BAND";
    ageBand?: FaithAgeBandFixture;
    snapshot?: {
      name: string | null;
      minimumAge: number | null;
      maximumAge: number | null;
    };
  },
): Promise<void> {
  const snapshot = options.snapshot ?? {
    name: options.ageBand?.name ?? null,
    minimumAge: options.ageBand?.minimumAge ?? null,
    maximumAge: options.ageBand?.maximumAge ?? null,
  };
  await tx.$executeRaw`
    INSERT INTO "FaithContentAudience" (
      "id", "tenantId", "faithContentVersionId", "type",
      "sourceAgeBandId", "ageBandName", "minimumAge", "maximumAge"
    ) VALUES (
      ${randomUUID()}, ${options.fixture.tenantAId}, ${options.versionId},
      ${options.type}::"FaithContentAudienceType",
      ${options.ageBand?.id ?? null}, ${snapshot.name},
      ${snapshot.minimumAge}, ${snapshot.maximumAge}
    )
  `;
}

async function validateFaithAudience(
  tx: Prisma.TransactionClient,
): Promise<void> {
  await tx.$executeRawUnsafe(`
    SET CONSTRAINTS
      "FaithContentVersion_validate_audience",
      "FaithContentAudience_validate_version"
    IMMEDIATE
  `);
}

async function publishFaithContent(
  tx: Prisma.TransactionClient,
  fixture: ReportsFixture,
  audiences: Array<
    | { type: "ALL_ACTIVE_STUDENTS" }
    | { type: "AGE_BAND"; ageBand: FaithAgeBandFixture }
  >,
): Promise<FaithContentFixture> {
  const draft = await createFaithDraft(tx, fixture);
  const versionId = await insertFaithVersion(tx, fixture, draft);
  for (const audience of audiences) {
    await insertFaithAudience(tx, {
      fixture,
      versionId,
      type: audience.type,
      ageBand: audience.type === "AGE_BAND" ? audience.ageBand : undefined,
    });
  }
  await validateFaithAudience(tx);
  return { ...draft, versionId };
}

async function insertFaithReadReceipt(
  tx: Prisma.TransactionClient,
  fixture: ReportsFixture,
  versionId: string,
  studentIdentityId = fixture.studentIdentityId,
): Promise<string> {
  const receiptId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "FaithReadReceipt" (
      "id", "tenantId", "faithContentVersionId", "studentIdentityId",
      "readAt"
    ) VALUES (
      ${receiptId}, ${fixture.tenantAId}, ${versionId}, ${studentIdentityId},
      ${new Date("2026-08-01T10:00:00.000Z")}
    )
  `;
  return receiptId;
}

async function insertFaithReflection(
  tx: Prisma.TransactionClient,
  fixture: ReportsFixture,
  versionId: string,
): Promise<string> {
  const reflectionId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "FaithReflection" (
      "id", "tenantId", "faithContentVersionId", "studentIdentityId",
      "reflectionEncrypted", "submittedAt"
    ) VALUES (
      ${reflectionId}, ${fixture.tenantAId}, ${versionId},
      ${fixture.studentIdentityId}, ${"enc:private-reflection"},
      ${new Date("2026-08-01T10:05:00.000Z")}
    )
  `;
  return reflectionId;
}

async function countGuardianVisibleReflections(
  tx: Prisma.TransactionClient,
  options: {
    versionId: string;
    guardianUserId: string;
  },
): Promise<bigint> {
  const [row] = await tx.$queryRaw<Array<{ count: bigint }>>`
    SELECT count(DISTINCT reflection."id") AS "count"
    FROM "FaithReflection" AS reflection
    JOIN "StudentIdentityLink" AS student_link
      ON student_link."tenantId" = reflection."tenantId"
      AND student_link."studentIdentityId" = reflection."studentIdentityId"
      AND student_link."endedAt" IS NULL
      AND student_link."revokedAt" IS NULL
    JOIN "Child" AS child
      ON child."id" = student_link."childId"
      AND child."tenantId" = student_link."tenantId"
    JOIN "GuardianChildRelationship" AS relationship
      ON relationship."tenantId" = child."tenantId"
      AND relationship."childId" = child."id"
      AND relationship."legalAccess" = 'FULL'
      AND relationship."startsAt" <= ${new Date("2026-08-01T12:00:00.000Z")}
      AND relationship."endedAt" IS NULL
      AND relationship."revokedAt" IS NULL
    JOIN "GuardianIdentity" AS guardian
      ON guardian."id" = relationship."guardianIdentityId"
      AND guardian."tenantId" = relationship."tenantId"
    WHERE reflection."faithContentVersionId" = ${options.versionId}
      AND reflection."guardianReleasedAt" IS NOT NULL
      AND guardian."userId" = ${options.guardianUserId}
      AND EXISTS (
        SELECT 1
        FROM "FaithContentAudience" AS audience
        WHERE audience."faithContentVersionId" = reflection."faithContentVersionId"
          AND audience."tenantId" = reflection."tenantId"
          AND (
            audience."type" = 'ALL_ACTIVE_STUDENTS'
            OR (
              child."dateOfBirth" IS NOT NULL
              AND EXTRACT(YEAR FROM age(
                ${new Date("2026-08-01T00:00:00.000Z")}::date,
                child."dateOfBirth"
              )) BETWEEN audience."minimumAge" AND audience."maximumAge"
            )
          )
      )
  `;
  return row?.count ?? 0n;
}

describe("ACE report publication storage", () => {
  const lockObserver = new PrismaClient();
  let fixture: ReportsFixture;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await lockObserver.$connect();
    fixture = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      childAId: randomUUID(),
      childA2Id: randomUUID(),
      childA3Id: randomUUID(),
      childBId: randomUUID(),
      periodAId: randomUUID(),
      periodBId: randomUUID(),
      authorUserId: randomUUID(),
      reviewerUserId: randomUUID(),
      fullGuardianUserId: randomUUID(),
      limitedGuardianUserId: randomUUID(),
      endedGuardianUserId: randomUUID(),
      studentUserId: randomUUID(),
      ineligibleStudentUserId: randomUUID(),
      noDobStudentUserId: randomUUID(),
      tenantBStudentUserId: randomUUID(),
      unrelatedUserId: randomUUID(),
      studentIdentityId: randomUUID(),
      ineligibleStudentIdentityId: randomUUID(),
      noDobStudentIdentityId: randomUUID(),
      tenantBStudentIdentityId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgAId,
          name: "Reports org A",
          slug: `reports-a-${fixture.orgAId}`,
          planCode: "trial",
        },
        {
          id: fixture.orgBId,
          name: "Reports org B",
          slug: `reports-b-${fixture.orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          orgId: fixture.orgAId,
          name: "Reports tenant A",
          slug: `reports-a-${fixture.tenantAId}`,
        },
        {
          id: fixture.tenantBId,
          orgId: fixture.orgBId,
          name: "Reports tenant B",
          slug: `reports-b-${fixture.tenantBId}`,
        },
      ],
    });
    await prisma.user.createMany({
      data: [
        fixture.authorUserId,
        fixture.reviewerUserId,
        fixture.fullGuardianUserId,
        fixture.limitedGuardianUserId,
        fixture.endedGuardianUserId,
        fixture.studentUserId,
        fixture.ineligibleStudentUserId,
        fixture.noDobStudentUserId,
        fixture.tenantBStudentUserId,
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

    await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
      await tx.child.createMany({
        data: [
            {
              id: fixture.childAId,
              tenantId: fixture.tenantAId,
              firstName: "Report",
              lastName: "Child A",
              dateOfBirth: new Date("2016-04-10T00:00:00.000Z"),
            },
            {
              id: fixture.childA2Id,
              tenantId: fixture.tenantAId,
              firstName: "Report",
              lastName: "Child A2",
              dateOfBirth: new Date("2008-04-10T00:00:00.000Z"),
            },
            {
              id: fixture.childA3Id,
              tenantId: fixture.tenantAId,
              firstName: "Report",
              lastName: "Child A3",
            },
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
        const endedGuardianIdentityId = randomUUID();
      await tx.$executeRaw`
        INSERT INTO "StudentPortalPolicy" ("tenantId", "studentPortalEnabled")
        VALUES (${fixture.tenantAId}, true)
      `;
      await tx.$executeRaw`
        INSERT INTO "GuardianIdentity" ("id", "tenantId", "userId") VALUES
          (${fullGuardianIdentityId}, ${fixture.tenantAId}, ${fixture.fullGuardianUserId}),
          (${limitedGuardianIdentityId}, ${fixture.tenantAId}, ${fixture.limitedGuardianUserId}),
          (${endedGuardianIdentityId}, ${fixture.tenantAId}, ${fixture.endedGuardianUserId})
      `;
      await tx.$executeRaw`
        INSERT INTO "GuardianChildRelationship" (
          "id", "tenantId", "guardianIdentityId", "childId", "legalAccess",
          "startsAt", "endedAt"
        ) VALUES
          (
            ${randomUUID()}, ${fixture.tenantAId}, ${fullGuardianIdentityId},
            ${fixture.childAId}, 'FULL', ${new Date("2025-08-01T00:00:00.000Z")}, NULL
          ),
          (
            ${randomUUID()}, ${fixture.tenantAId}, ${limitedGuardianIdentityId},
            ${fixture.childAId}, 'LIMITED', ${new Date("2025-08-01T00:00:00.000Z")}, NULL
          ),
          (
            ${randomUUID()}, ${fixture.tenantAId}, ${endedGuardianIdentityId},
            ${fixture.childAId}, 'FULL',
            ${new Date("2025-08-01T00:00:00.000Z")},
            ${new Date("2026-07-01T00:00:00.000Z")}
          )
      `;
      await tx.$executeRaw`
        INSERT INTO "StudentIdentity" ("id", "tenantId", "userId") VALUES
          (${fixture.studentIdentityId}, ${fixture.tenantAId}, ${fixture.studentUserId}),
          (
            ${fixture.ineligibleStudentIdentityId}, ${fixture.tenantAId},
            ${fixture.ineligibleStudentUserId}
          ),
          (
            ${fixture.noDobStudentIdentityId}, ${fixture.tenantAId},
            ${fixture.noDobStudentUserId}
          )
      `;
      await tx.$executeRaw`
        INSERT INTO "StudentIdentityLink" (
          "id", "tenantId", "studentIdentityId", "childId"
        ) VALUES
          (
            ${randomUUID()}, ${fixture.tenantAId},
            ${fixture.studentIdentityId}, ${fixture.childAId}
          ),
          (
            ${randomUUID()}, ${fixture.tenantAId},
            ${fixture.ineligibleStudentIdentityId}, ${fixture.childA2Id}
          ),
          (
            ${randomUUID()}, ${fixture.tenantAId},
            ${fixture.noDobStudentIdentityId}, ${fixture.childA3Id}
          )
      `;
      },
    );

    await withReportsRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      async (tx) => {
      await tx.child.create({
          data: {
            id: fixture.childBId,
            tenantId: fixture.tenantBId,
            firstName: "Report",
            lastName: "Child B",
          },
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
        await tx.$executeRaw`
        INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
        VALUES (
          ${fixture.tenantBStudentIdentityId}, ${fixture.tenantBId},
          ${fixture.tenantBStudentUserId}
        )
      `;
      },
    );
  });

  afterEach(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteFaithRowsIfPresent(prisma);
    await deleteReportRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteFaithRowsIfPresent(prisma);
    await deleteReportRowsIfPresent(prisma);
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
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
    await prisma.academicPeriod.deleteMany({
      where: { id: { in: [fixture.periodAId, fixture.periodBId] } },
    });
    await prisma.academicYear.deleteMany({
      where: { tenantId: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    await prisma.child.deleteMany({
      where: {
        id: {
          in: [
            fixture.childAId,
            fixture.childA2Id,
            fixture.childA3Id,
            fixture.childBId,
          ],
        },
      },
    });
    await prisma.siteMembership.deleteMany({
      where: { tenantId: fixture.tenantAId },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            fixture.authorUserId,
            fixture.reviewerUserId,
            fixture.fullGuardianUserId,
            fixture.limitedGuardianUserId,
            fixture.endedGuardianUserId,
            fixture.studentUserId,
            fixture.ineligibleStudentUserId,
            fixture.noDobStudentUserId,
            fixture.tenantBStudentUserId,
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

  afterAll(async () => {
    await lockObserver.$disconnect();
  });

  it("rejects approval by the report author", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture, "IN_REVIEW"),
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          approveReport(tx, {
            tenantId: fixture.tenantAId,
            draftId: draft.draftId,
            reviewerUserId: fixture.authorUserId,
          }),
      ),
      "23514",
    );
  });

  it("requires review submission before approval", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture),
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          approveReport(tx, {
            tenantId: fixture.tenantAId,
            draftId: draft.draftId,
            reviewerUserId: fixture.reviewerUserId,
          }),
      ),
      "23514",
    );
  });

  it("rejects a report compiler outside the tenant", async () => {
    if (!isDatabaseAvailable()) return;
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
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
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
        INSERT INTO "AceReportDraft" (
          "id", "tenantId", "reportId", "compilationId", "familyPayload",
          "status", "authorUserId"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${source.reportId},
          ${source.compilationId}, ${JSON.stringify({ summary: "Bypass" })}::jsonb,
          'DRAFT', ${fixture.unrelatedUserId}
        )
      `,
        ),
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
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
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
        () =>
          withReportsRlsContext(
            fixture.tenantAId,
            fixture.orgAId,
            (tx) => tx.$executeRaw`
          INSERT INTO "AceReportPublicationBypassProbe" ("draftId", "versionId")
          VALUES (${draft.draftId}, ${versionId})
        `,
          ),
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

  it("denies a crafted temporary trigger access to report publication", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture, "IN_REVIEW"),
    );

    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          async (tx) => {
            await tx.$executeRawUnsafe(`
              CREATE TEMP TABLE "AceReportPublicationTriggerProbe" (
                "tenantId" TEXT NOT NULL,
                "draftId" TEXT NOT NULL,
                "reviewerUserId" TEXT NOT NULL,
                "decision" app."AceReportReviewDecision" NOT NULL
              ) ON COMMIT DROP
            `);
            await tx.$executeRawUnsafe(`
              CREATE TRIGGER "AceReportPublicationTriggerProbe_publish"
              AFTER INSERT ON "AceReportPublicationTriggerProbe"
              FOR EACH ROW
              EXECUTE FUNCTION app.publish_approved_ace_report()
            `);
            await tx.$executeRaw`
              INSERT INTO "AceReportPublicationTriggerProbe" (
                "tenantId", "draftId", "reviewerUserId", "decision"
              ) VALUES (
                ${fixture.tenantAId}, ${draft.draftId},
                ${fixture.reviewerUserId}, 'APPROVED'
              )
            `;
          },
        ),
      "42501",
    );

    const [facts] = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<Array<{ status: string; versionCount: bigint }>>`
        SELECT
          draft."status"::text AS "status",
          (
            SELECT count(*)
            FROM "AceTermReportVersion" AS version
            WHERE version."sourceDraftId" = draft."id"
          ) AS "versionCount"
        FROM "AceReportDraft" AS draft
        WHERE draft."id" = ${draft.draftId}
      `,
    );
    expect(facts).toEqual({ status: "IN_REVIEW", versionCount: 0n });
  });

  it("keeps report publication executable only through its isolated trigger owner", async () => {
    if (!isDatabaseAvailable()) return;
    const [security] = await prisma.$queryRaw<ReportPublisherSecurityRow[]>`
      SELECT
        owner."rolname" AS "functionOwner",
        routine."prosecdef" AS "securityDefiner",
        NOT EXISTS (
          SELECT 1
          FROM pg_catalog.aclexplode(
            COALESCE(
              routine."proacl",
              pg_catalog.acldefault('f', routine."proowner")
            )
          ) AS privilege
          LEFT JOIN pg_catalog."pg_roles" AS grantee
            ON grantee."oid" = privilege."grantee"
          WHERE privilege."privilege_type" = 'EXECUTE'
            AND (
              privilege."grantee" = 0
              OR grantee."rolname" IN ('anon', 'authenticated')
            )
        ) AS "broadExecuteRevoked",
        EXISTS (
          SELECT 1
          FROM pg_catalog."pg_trigger" AS report_trigger
          WHERE report_trigger."tgrelid" = 'app."AceReportReview"'::regclass
            AND report_trigger."tgname" = 'AceReportReview_publish_approval'
            AND report_trigger."tgfoid" = routine."oid"
            AND NOT report_trigger."tgisinternal"
        ) AS "legitimateTriggerInstalled",
        pg_catalog.has_schema_privilege(
          owner."rolname", 'app', 'USAGE'
        ) AS "schemaUsageGranted",
        NOT pg_catalog.has_schema_privilege(
          owner."rolname", 'app', 'CREATE'
        ) AS "schemaCreateRevoked",
        COALESCE(
          (
            SELECT array_agg(
              relation."relname" || ':' || privilege."privilege_type"
              ORDER BY relation."relname", privilege."privilege_type"
            )
            FROM pg_catalog."pg_class" AS relation
            JOIN pg_catalog."pg_namespace" AS namespace
              ON namespace."oid" = relation."relnamespace"
            CROSS JOIN LATERAL pg_catalog.aclexplode(
              COALESCE(
                relation."relacl",
                pg_catalog.acldefault('r', relation."relowner")
              )
            ) AS privilege
            WHERE namespace."nspname" = 'app'
              AND relation."relkind" IN ('r', 'p')
              AND privilege."grantee" = owner."oid"
          ),
          ARRAY[]::text[]
        ) = ARRAY[
          'AceReportDraft:SELECT',
          'AceReportDraft:UPDATE',
          'AceTermReport:SELECT',
          'AceTermReport:UPDATE',
          'AceTermReportVersion:INSERT',
          'AceTermReportVersion:SELECT'
        ]::text[] AS "minimalTablePrivileges",
        (
          NOT owner."rolcanlogin"
          AND NOT owner."rolsuper"
          AND NOT owner."rolbypassrls"
          AND NOT owner."rolinherit"
          AND NOT owner."rolcreatedb"
          AND NOT owner."rolcreaterole"
          AND NOT owner."rolreplication"
          AND NOT EXISTS (
            SELECT 1
            FROM pg_catalog."pg_auth_members" AS membership
            WHERE membership."roleid" = owner."oid"
              OR membership."member" = owner."oid"
          )
        ) AS "isolatedRole"
      FROM pg_catalog."pg_proc" AS routine
      JOIN pg_catalog."pg_roles" AS owner
        ON owner."oid" = routine."proowner"
      WHERE routine."oid" =
        'app.publish_approved_ace_report()'::pg_catalog.regprocedure
    `;
    expect(security).toEqual({
      functionOwner: "pathway_ace_report_publisher",
      securityDefiner: true,
      broadExecuteRevoked: true,
      legitimateTriggerInstalled: true,
      schemaUsageGranted: true,
      schemaCreateRevoked: true,
      minimalTablePrivileges: true,
      isolatedRole: true,
    });
  });

  it("encrypts ordinary Prisma report source and note fields at rest", async () => {
    if (!isDatabaseAvailable()) return;
    const plaintext = {
      source: "Sensitive compiled assessment evidence",
      staffNotes: "Sensitive staff-only report context",
      reviewNotes: "Sensitive reviewer rationale",
    };
    const persisted = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const report = await tx.aceTermReport.create({
          data: {
            tenantId: fixture.tenantAId,
            childId: fixture.childAId,
            academicPeriodId: fixture.periodAId,
          },
        });
        const compilation = await tx.aceReportCompilation.create({
          data: {
            tenantId: fixture.tenantAId,
            reportId: report.id,
            sourceEncrypted: plaintext.source,
            compiledByUserId: fixture.authorUserId,
          },
        });
        const draft = await tx.aceReportDraft.create({
          data: {
            tenantId: fixture.tenantAId,
            reportId: report.id,
            compilationId: compilation.id,
            familyPayload: { summary: "Family-safe summary" },
            staffNotesEncrypted: plaintext.staffNotes,
            authorUserId: fixture.authorUserId,
          },
        });
        const review = await tx.aceReportReview.create({
          data: {
            tenantId: fixture.tenantAId,
            draftId: draft.id,
            reviewerUserId: fixture.reviewerUserId,
            decision: "REJECTED",
            reviewNotesEncrypted: plaintext.reviewNotes,
          },
        });
        const [raw] = await tx.$queryRaw<ReportPiiRow[]>`
          SELECT
            compilation."sourceEncrypted" AS "sourceEncrypted",
            draft."staffNotesEncrypted" AS "staffNotesEncrypted",
            review."reviewNotesEncrypted" AS "reviewNotesEncrypted"
          FROM "AceReportCompilation" AS compilation
          JOIN "AceReportDraft" AS draft
            ON draft."compilationId" = compilation."id"
          JOIN "AceReportReview" AS review
            ON review."draftId" = draft."id"
          WHERE review."id" = ${review.id}
        `;
        const application = {
          compilation: await tx.aceReportCompilation.findUniqueOrThrow({
            where: { id: compilation.id },
            select: { sourceEncrypted: true },
          }),
          draft: await tx.aceReportDraft.findUniqueOrThrow({
            where: { id: draft.id },
            select: { staffNotesEncrypted: true },
          }),
          review: await tx.aceReportReview.findUniqueOrThrow({
            where: { id: review.id },
            select: { reviewNotesEncrypted: true },
          }),
        };
        return { raw, application };
      },
    );

    expect(persisted.raw).toEqual({
      sourceEncrypted: expect.stringMatching(/^v1:/),
      staffNotesEncrypted: expect.stringMatching(/^v1:/),
      reviewNotesEncrypted: expect.stringMatching(/^v1:/),
    });
    expect(persisted.raw).not.toEqual(
      expect.objectContaining({
        sourceEncrypted: plaintext.source,
        staffNotesEncrypted: plaintext.staffNotes,
        reviewNotesEncrypted: plaintext.reviewNotes,
      }),
    );
    expect(persisted.application).toEqual({
      compilation: { sourceEncrypted: plaintext.source },
      draft: { staffNotesEncrypted: plaintext.staffNotes },
      review: { reviewNotesEncrypted: plaintext.reviewNotes },
    });
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

    const [facts] = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            fullGuardians: bigint;
            limitedGuardians: bigint;
            activeStudents: bigint;
            unrelatedLinks: bigint;
          }>
        >`
        SELECT
          (SELECT count(*) FROM "GuardianChildRelationship" WHERE "childId" = ${fixture.childAId} AND "legalAccess" = 'FULL' AND "endedAt" IS NULL AND "revokedAt" IS NULL) AS "fullGuardians",
          (SELECT count(*) FROM "GuardianChildRelationship" WHERE "childId" = ${fixture.childAId} AND "legalAccess" = 'LIMITED' AND "endedAt" IS NULL AND "revokedAt" IS NULL) AS "limitedGuardians",
          (SELECT count(*) FROM "StudentIdentityLink" WHERE "childId" = ${fixture.childAId} AND "endedAt" IS NULL AND "revokedAt" IS NULL) AS "activeStudents",
          (SELECT count(*) FROM "StudentIdentity" WHERE "userId" = ${fixture.unrelatedUserId}) AS "unrelatedLinks"
      `,
    );
    expect(facts).toEqual({
      fullGuardians: 1n,
      limitedGuardians: 1n,
      activeStudents: 1n,
      unrelatedLinks: 0n,
    });
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
        () =>
          withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
            tx.$executeRawUnsafe(statement),
          ),
        "55000",
      );
    }

    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
        INSERT INTO "AceTermReportVersion" (
          "id", "tenantId", "reportId", "sourceDraftId", "versionNumber",
          "familyPayload", "guardianVisibleAt"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${draft.reportId}, ${draft.draftId},
          99, ${JSON.stringify({ bypass: true })}::jsonb, CURRENT_TIMESTAMP
        )
      `,
        ),
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
      await waitForBlockedApprovalSessions(lockObserver, applicationNames);
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
      (tx) => tx.$queryRaw<
        Array<
          Pick<
            ReportVersionRow,
            "id" | "sourceDraftId" | "versionNumber" | "supersedesVersionId"
          >
        >
      >`
        SELECT "id", "sourceDraftId", "versionNumber", "supersedesVersionId"
        FROM "AceTermReportVersion"
        WHERE "reportId" = ${first.draft.reportId}
        ORDER BY "versionNumber"
      `,
    );
    expect(versions.map((version) => version.versionNumber)).toEqual([1, 2, 3]);
    expect(versions[1]?.supersedesVersionId).toBe(versions[0]?.id);
    expect(versions[2]?.supersedesVersionId).toBe(versions[1]?.id);
    expect(
      new Set(versions.slice(1).map((version) => version.sourceDraftId)),
    ).toEqual(new Set(corrections.map((draft) => draft.draftId)));
  });

  it("allows one explicit student release without opening published content", async () => {
    if (!isDatabaseAvailable()) return;
    const { version } = await publishReport(fixture);
    const releasedAt = new Date("2026-12-20T12:00:00.000Z");
    await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$executeRaw`
      UPDATE "AceTermReportVersion"
      SET "studentVisibleAt" = ${releasedAt}
      WHERE "id" = ${version.id}
    `,
    );
    const updated = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => getReportVersion(tx, version.reportId),
    );
    expect(updated.studentVisibleAt).toEqual(releasedAt);
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
        UPDATE "AceTermReportVersion"
        SET "studentVisibleAt" = ${new Date("2026-12-21T12:00:00.000Z")}
        WHERE "id" = ${version.id}
      `,
        ),
      "55000",
    );
  });

  it("rejects report target changes and cross-tenant targets", async () => {
    if (!isDatabaseAvailable()) return;
    const draft = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => createDraftFixture(tx, fixture),
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
        UPDATE "AceTermReport" SET "childId" = ${fixture.childA2Id} WHERE "id" = ${draft.reportId}
      `,
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
        INSERT INTO "AceTermReport" ("id", "tenantId", "childId", "academicPeriodId")
        VALUES (${randomUUID()}, ${fixture.tenantAId}, ${fixture.childBId}, ${fixture.periodAId})
      `,
        ),
      "23503",
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) => tx.$executeRaw`
        INSERT INTO "AceTermReport" ("id", "tenantId", "childId", "academicPeriodId")
        VALUES (${randomUUID()}, ${fixture.tenantAId}, ${fixture.childA2Id}, ${fixture.periodBId})
      `,
        ),
      "23503",
    );
  });

  it("fails closed under forced tenant RLS", async () => {
    if (!isDatabaseAvailable()) return;
    await publishReport(fixture);
    const tenantBCounts = await withReportsRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) => tx.$queryRaw<
        Array<{
          reports: bigint;
          compilations: bigint;
          drafts: bigint;
          reviews: bigint;
          versions: bigint;
        }>
      >`
      SELECT
        (SELECT count(*) FROM "AceTermReport") AS "reports",
        (SELECT count(*) FROM "AceReportCompilation") AS "compilations",
        (SELECT count(*) FROM "AceReportDraft") AS "drafts",
        (SELECT count(*) FROM "AceReportReview") AS "reviews",
        (SELECT count(*) FROM "AceTermReportVersion") AS "versions"
    `,
    );
    expect(tenantBCounts).toEqual([
      { reports: 0n, compilations: 0n, drafts: 0n, reviews: 0n, versions: 0n },
    ]);
  });

  it("publishes multiple age bands with frozen audience snapshots", async () => {
    if (!isDatabaseAvailable()) return;
    const juniors: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    const seniors: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Seniors",
      minimumAge: 13,
      maximumAge: 18,
    };
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createFaithAgeBand(tx, juniors);
        await createFaithAgeBand(tx, seniors);
        return publishFaithContent(tx, fixture, [
          { type: "AGE_BAND", ageBand: juniors },
          { type: "AGE_BAND", ageBand: seniors },
        ]);
      },
    );

    await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$executeRaw`
        UPDATE "FaithAgeBand"
        SET "name" = 'Primary', "minimumAge" = 7, "maximumAge" = 11
        WHERE "id" = ${juniors.id}
      `,
    );

    const result = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const audiences = await tx.$queryRaw<FaithAudienceRow[]>`
          SELECT
            "type", "sourceAgeBandId", "ageBandName", "minimumAge",
            "maximumAge"
          FROM "FaithContentAudience"
          WHERE "faithContentVersionId" = ${publication.versionId}
          ORDER BY "minimumAge"
        `;
        const [draft] = await tx.$queryRaw<Array<{ status: string }>>`
          SELECT "status"
          FROM "FaithContentDraft"
          WHERE "id" = ${publication.draftId}
        `;
        return { audiences, draft };
      },
    );
    expect(result.audiences).toEqual([
      {
        type: "AGE_BAND",
        sourceAgeBandId: juniors.id,
        ageBandName: "Juniors",
        minimumAge: 8,
        maximumAge: 12,
      },
      {
        type: "AGE_BAND",
        sourceAgeBandId: seniors.id,
        ageBandName: "Seniors",
        minimumAge: 13,
        maximumAge: 18,
      },
    ]);
    expect(result.draft).toEqual({ status: "PUBLISHED" });
  });

  it("publishes one atomic all-active-students audience", async () => {
    if (!isDatabaseAvailable()) return;
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        publishFaithContent(tx, fixture, [{ type: "ALL_ACTIVE_STUDENTS" }]),
    );
    const audiences = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<FaithAudienceRow[]>`
        SELECT
          "type", "sourceAgeBandId", "ageBandName", "minimumAge",
          "maximumAge"
        FROM "FaithContentAudience"
        WHERE "faithContentVersionId" = ${publication.versionId}
      `,
    );
    expect(audiences).toEqual([
      {
        type: "ALL_ACTIVE_STUDENTS",
        sourceAgeBandId: null,
        ageBandName: null,
        minimumAge: null,
        maximumAge: null,
      },
    ]);
  });

  it("rejects an empty published audience", async () => {
    if (!isDatabaseAvailable()) return;
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          const draft = await createFaithDraft(tx, fixture);
          await insertFaithVersion(tx, fixture, draft);
          await validateFaithAudience(tx);
        }),
      "23514",
    );
  });

  it("rejects invalid and incomplete age-band snapshots", async () => {
    if (!isDatabaseAvailable()) return;
    const reversed: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Reversed",
      minimumAge: 12,
      maximumAge: 8,
    };
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          createFaithAgeBand(tx, reversed),
        ),
      "23514",
    );

    const juniors: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          await createFaithAgeBand(tx, juniors);
          const draft = await createFaithDraft(tx, fixture);
          const versionId = await insertFaithVersion(tx, fixture, draft);
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "AGE_BAND",
            ageBand: juniors,
            snapshot: {
              name: "Juniors",
              minimumAge: 8,
              maximumAge: null,
            },
          });
          await validateFaithAudience(tx);
        }),
      "23514",
    );

    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          await createFaithAgeBand(tx, juniors);
          const draft = await createFaithDraft(tx, fixture);
          const versionId = await insertFaithVersion(tx, fixture, draft);
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "AGE_BAND",
            ageBand: juniors,
            snapshot: {
              name: "Juniors",
              minimumAge: 7,
              maximumAge: 12,
            },
          });
          await validateFaithAudience(tx);
        }),
      "23514",
    );
  });

  it("rejects an archived age band at publication", async () => {
    if (!isDatabaseAvailable()) return;
    const archivedBand: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Archived Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createFaithAgeBand(tx, archivedBand);
        await tx.$executeRaw`
          UPDATE "FaithAgeBand"
          SET "archivedAt" = ${new Date("2026-07-31T12:00:00.000Z")}
          WHERE "id" = ${archivedBand.id}
        `;
      },
    );

    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          const draft = await createFaithDraft(tx, fixture);
          const versionId = await insertFaithVersion(tx, fixture, draft);
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "AGE_BAND",
            ageBand: archivedBand,
          });
          await validateFaithAudience(tx);
        }),
      "23514",
    );
  });

  it("rejects a Faith draft authored by a non-tenant member", async () => {
    if (!isDatabaseAvailable()) return;
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          createFaithDraft(tx, fixture, fixture.unrelatedUserId),
        ),
      "23503",
    );
  });

  it("rejects duplicate and mixed all-student audiences", async () => {
    if (!isDatabaseAvailable()) return;
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          const draft = await createFaithDraft(tx, fixture);
          const versionId = await insertFaithVersion(tx, fixture, draft);
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "ALL_ACTIVE_STUDENTS",
          });
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "ALL_ACTIVE_STUDENTS",
          });
        }),
      "23505",
    );

    const juniors: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          await createFaithAgeBand(tx, juniors);
          const draft = await createFaithDraft(tx, fixture);
          const versionId = await insertFaithVersion(tx, fixture, draft);
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "ALL_ACTIVE_STUDENTS",
          });
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "AGE_BAND",
            ageBand: juniors,
          });
          await validateFaithAudience(tx);
        }),
      "23514",
    );
  });

  it("rejects a cross-tenant source age band", async () => {
    if (!isDatabaseAvailable()) return;
    const tenantBBand: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantBId,
      name: "Tenant B Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    await withReportsRlsContext(fixture.tenantBId, fixture.orgBId, (tx) =>
      createFaithAgeBand(tx, tenantBBand),
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          const draft = await createFaithDraft(tx, fixture);
          const versionId = await insertFaithVersion(tx, fixture, draft);
          await insertFaithAudience(tx, {
            fixture,
            versionId,
            type: "AGE_BAND",
            ageBand: tenantBBand,
          });
        }),
      "23503",
    );
  });

  it("rejects published version and final audience mutations", async () => {
    if (!isDatabaseAvailable()) return;
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        publishFaithContent(tx, fixture, [{ type: "ALL_ACTIVE_STUDENTS" }]),
    );
    const mutationStatements = [
      `UPDATE "FaithContentVersion" SET "title" = 'Changed' WHERE "id" = '${publication.versionId}'`,
      `UPDATE "FaithContentVersion" SET "contentPayload" = '{"changed":true}'::jsonb WHERE "id" = '${publication.versionId}'`,
      `DELETE FROM "FaithContentVersion" WHERE "id" = '${publication.versionId}'`,
      `UPDATE "FaithContentAudience" SET "type" = 'AGE_BAND' WHERE "faithContentVersionId" = '${publication.versionId}'`,
      `DELETE FROM "FaithContentAudience" WHERE "faithContentVersionId" = '${publication.versionId}'`,
    ];
    for (const statement of mutationStatements) {
      await expectDatabaseRejection(
        () =>
          withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
            tx.$executeRawUnsafe(statement),
          ),
        "55000",
      );
    }
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertFaithAudience(tx, {
            fixture,
            versionId: publication.versionId,
            type: "ALL_ACTIVE_STUDENTS",
          }),
        ),
      "55000",
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
          const draft = await createFaithDraft(tx, fixture);
          await tx.$executeRaw`
            INSERT INTO "FaithContentVersion" (
              "id", "tenantId", "faithContentId", "sourceDraftId",
              "versionNumber", "title", "contentPayload", "publishedAt"
            ) VALUES (
              ${randomUUID()}, ${fixture.tenantAId}, ${publication.contentId},
              ${draft.draftId}, 1, ${"Duplicate"},
              ${JSON.stringify({ body: "Duplicate" })}::jsonb,
              ${new Date("2026-08-01T11:00:00.000Z")}
            )
          `;
        }),
      "23503",
    );
  });

  it("retains the facts needed for age eligibility and missing-date denial", async () => {
    if (!isDatabaseAvailable()) return;
    const juniors: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    const ageBandPublication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createFaithAgeBand(tx, juniors);
        return publishFaithContent(tx, fixture, [
          { type: "AGE_BAND", ageBand: juniors },
        ]);
      },
    );
    const eligibleUsers = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<Array<{ userId: string }>>`
        SELECT DISTINCT identity."userId"
        FROM "StudentIdentity" AS identity
        JOIN "StudentIdentityLink" AS student_link
          ON student_link."studentIdentityId" = identity."id"
          AND student_link."tenantId" = identity."tenantId"
          AND student_link."endedAt" IS NULL
          AND student_link."revokedAt" IS NULL
        JOIN "Child" AS child
          ON child."id" = student_link."childId"
          AND child."tenantId" = student_link."tenantId"
        JOIN "FaithContentAudience" AS audience
          ON audience."tenantId" = child."tenantId"
          AND audience."faithContentVersionId" = ${ageBandPublication.versionId}
        WHERE child."dateOfBirth" IS NOT NULL
          AND EXTRACT(YEAR FROM age(
            ${new Date("2026-08-01T00:00:00.000Z")}::date,
            child."dateOfBirth"
          )) BETWEEN audience."minimumAge" AND audience."maximumAge"
      `,
    );
    expect(eligibleUsers).toEqual([{ userId: fixture.studentUserId }]);

    const allStudentsPublication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        publishFaithContent(tx, fixture, [{ type: "ALL_ACTIVE_STUDENTS" }]),
    );
    const allActiveUsers = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<Array<{ userId: string }>>`
        SELECT identity."userId"
        FROM "StudentIdentity" AS identity
        JOIN "StudentIdentityLink" AS student_link
          ON student_link."studentIdentityId" = identity."id"
          AND student_link."tenantId" = identity."tenantId"
          AND student_link."endedAt" IS NULL
          AND student_link."revokedAt" IS NULL
        WHERE EXISTS (
          SELECT 1
          FROM "FaithContentAudience" AS audience
          WHERE audience."faithContentVersionId" = ${allStudentsPublication.versionId}
            AND audience."tenantId" = identity."tenantId"
            AND audience."type" = 'ALL_ACTIVE_STUDENTS'
        )
        ORDER BY identity."userId"
      `,
    );
    expect(allActiveUsers.map(({ userId }) => userId)).toEqual(
      [
        fixture.studentUserId,
        fixture.ineligibleStudentUserId,
        fixture.noDobStudentUserId,
      ].sort(),
    );
  });

  it("enforces unique identity read and reflection targets", async () => {
    if (!isDatabaseAvailable()) return;
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        publishFaithContent(tx, fixture, [{ type: "ALL_ACTIVE_STUDENTS" }]),
    );
    const created = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => ({
        receiptId: await insertFaithReadReceipt(
          tx,
          fixture,
          publication.versionId,
        ),
        reflectionId: await insertFaithReflection(
          tx,
          fixture,
          publication.versionId,
        ),
      }),
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertFaithReadReceipt(tx, fixture, publication.versionId),
        ),
      "23505",
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertFaithReflection(tx, fixture, publication.versionId),
        ),
      "23505",
    );
    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertFaithReadReceipt(
            tx,
            fixture,
            publication.versionId,
            fixture.tenantBStudentIdentityId,
          ),
        ),
      "23503",
    );
    for (const statement of [
      `UPDATE "FaithReadReceipt" SET "studentIdentityId" = '${fixture.ineligibleStudentIdentityId}' WHERE "id" = '${created.receiptId}'`,
      `UPDATE "FaithReflection" SET "studentIdentityId" = '${fixture.ineligibleStudentIdentityId}' WHERE "id" = '${created.reflectionId}'`,
    ]) {
      await expectDatabaseRejection(
        () =>
          withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
            tx.$executeRawUnsafe(statement),
          ),
        "55000",
      );
    }
  });

  it("encrypts ordinary Prisma reflection writes at rest and decrypts application reads", async () => {
    if (!isDatabaseAvailable()) return;
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        publishFaithContent(tx, fixture, [{ type: "ALL_ACTIVE_STUDENTS" }]),
    );
    const plaintext = "I prayed for wisdom today.";
    const created = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.faithReflection.create({
          data: {
            tenantId: fixture.tenantAId,
            faithContentVersionId: publication.versionId,
            studentIdentityId: fixture.studentIdentityId,
            reflectionEncrypted: plaintext,
            submittedAt: new Date("2026-08-01T10:05:00.000Z"),
          },
        }),
    );
    expect(created.reflectionEncrypted).toBe(plaintext);

    const persisted = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        const [raw] = await tx.$queryRaw<
          Array<{ reflectionEncrypted: string }>
        >`
          SELECT "reflectionEncrypted"
          FROM "FaithReflection"
          WHERE "id" = ${created.id}
        `;
        const application = await tx.faithReflection.findUniqueOrThrow({
          where: { id: created.id },
        });
        return { raw, application };
      },
    );
    expect(persisted.raw?.reflectionEncrypted).not.toBe(plaintext);
    expect(persisted.raw?.reflectionEncrypted.startsWith("v1:")).toBe(true);
    expect(persisted.application.reflectionEncrypted).toBe(plaintext);
  });

  it("rejects reflection release by a non-tenant member", async () => {
    if (!isDatabaseAvailable()) return;
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        publishFaithContent(tx, fixture, [{ type: "ALL_ACTIVE_STUDENTS" }]),
    );
    const reflectionId = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertFaithReflection(tx, fixture, publication.versionId),
    );

    await expectDatabaseRejection(
      () =>
        withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          tx.$executeRaw`
            UPDATE "FaithReflection"
            SET
              "guardianReleasedAt" = ${new Date("2026-08-01T11:00:00.000Z")},
              "releasedByUserId" = ${fixture.unrelatedUserId}
            WHERE "id" = ${reflectionId}
          `,
        ),
      "23503",
    );
  });

  it("releases reflections once to eligible guardians", async () => {
    if (!isDatabaseAvailable()) return;
    const juniors: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createFaithAgeBand(tx, juniors);
        return publishFaithContent(tx, fixture, [
          { type: "AGE_BAND", ageBand: juniors },
        ]);
      },
    );
    const reflectionId = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertFaithReflection(tx, fixture, publication.versionId),
    );
    const beforeRelease = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        countGuardianVisibleReflections(tx, {
          versionId: publication.versionId,
          guardianUserId: fixture.fullGuardianUserId,
        }),
    );
    expect(beforeRelease).toBe(0n);

    await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await tx.faithReflection.update({
          where: { id: reflectionId },
          data: { reflectionEncrypted: "Edited before release" },
        });
        await tx.$executeRaw`
          UPDATE "FaithReflection"
          SET
            "guardianReleasedAt" = ${new Date("2026-08-01T11:00:00.000Z")},
            "releasedByUserId" = ${fixture.reviewerUserId}
          WHERE "id" = ${reflectionId}
        `;
      },
    );

    const visibility = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => ({
        full: await countGuardianVisibleReflections(tx, {
          versionId: publication.versionId,
          guardianUserId: fixture.fullGuardianUserId,
        }),
        limited: await countGuardianVisibleReflections(tx, {
          versionId: publication.versionId,
          guardianUserId: fixture.limitedGuardianUserId,
        }),
        ended: await countGuardianVisibleReflections(tx, {
          versionId: publication.versionId,
          guardianUserId: fixture.endedGuardianUserId,
        }),
        unrelated: await countGuardianVisibleReflections(tx, {
          versionId: publication.versionId,
          guardianUserId: fixture.unrelatedUserId,
        }),
        reflection: await tx.faithReflection.findUniqueOrThrow({
          where: { id: reflectionId },
          select: {
            reflectionEncrypted: true,
            guardianReleasedAt: true,
            releasedByUserId: true,
          },
        }),
      }),
    );
    expect(visibility).toMatchObject({
      full: 1n,
      limited: 0n,
      ended: 0n,
      unrelated: 0n,
      reflection: {
        reflectionEncrypted: "Edited before release",
        guardianReleasedAt: new Date("2026-08-01T11:00:00.000Z"),
        releasedByUserId: fixture.reviewerUserId,
      },
    });

    for (const statement of [
      `UPDATE "FaithReflection" SET "reflectionEncrypted" = 'enc:changed' WHERE "id" = '${reflectionId}'`,
      `UPDATE "FaithReflection" SET "guardianReleasedAt" = NULL, "releasedByUserId" = NULL WHERE "id" = '${reflectionId}'`,
    ]) {
      await expectDatabaseRejection(
        () =>
          withReportsRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
            tx.$executeRawUnsafe(statement),
          ),
        "55000",
      );
    }
  });

  it("fails closed for every F18 table under forced tenant RLS", async () => {
    if (!isDatabaseAvailable()) return;
    await publishReport(fixture);
    const tenantAAgeBand: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "Tenant A Isolation Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    const publication = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createFaithAgeBand(tx, tenantAAgeBand);
        const created = await publishFaithContent(tx, fixture, [
          { type: "AGE_BAND", ageBand: tenantAAgeBand },
        ]);
        await insertFaithReadReceipt(tx, fixture, created.versionId);
        await insertFaithReflection(tx, fixture, created.versionId);
        return created;
      },
    );
    expect(publication.versionId).toEqual(expect.any(String));

    await withReportsRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      async (tx) => {
        for (const tableName of F18_TABLES) {
          const [{ count }] = await tx.$queryRawUnsafe<CountRow[]>(
            `SELECT count(*)::int AS count FROM "${tableName}"`,
          );
          expect(count).toBe(0);
        }
      },
    );
  });

  it("enables and forces RLS and revokes broad table grants for every Faith table", async () => {
    if (!isDatabaseAvailable()) return;
    const catalog = await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.$queryRaw<
        Array<{
          tableName: string;
          rlsEnabled: boolean;
          rlsForced: boolean;
          broadRolePrivilegesRevoked: boolean;
        }>
      >`
        SELECT
          relation.relname AS "tableName",
          relation.relrowsecurity AS "rlsEnabled",
          relation.relforcerowsecurity AS "rlsForced",
          NOT EXISTS (
            SELECT 1
            FROM aclexplode(
              COALESCE(
                relation.relacl,
                acldefault('r', relation.relowner)
              )
            ) AS privilege
            LEFT JOIN pg_roles AS grantee
              ON grantee.oid = privilege.grantee
            WHERE privilege.grantee = 0
              OR grantee.rolname IN ('anon', 'authenticated')
          ) AS "broadRolePrivilegesRevoked"
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace
          ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = current_schema()
          AND relation.relname IN (
            'FaithAgeBand',
            'FaithContent',
            'FaithContentDraft',
            'FaithContentVersion',
            'FaithContentAudience',
            'FaithReadReceipt',
            'FaithReflection'
          )
        ORDER BY relation.relname
      `,
    );
    expect(catalog).toEqual([
      {
        tableName: "FaithAgeBand",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
      {
        tableName: "FaithContent",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
      {
        tableName: "FaithContentAudience",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
      {
        tableName: "FaithContentDraft",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
      {
        tableName: "FaithContentVersion",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
      {
        tableName: "FaithReadReceipt",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
      {
        tableName: "FaithReflection",
        rlsEnabled: true,
        rlsForced: true,
        broadRolePrivilegesRevoked: true,
      },
    ]);
  });

  it("fails closed for every F18 table without tenant context", async () => {
    if (!isDatabaseAvailable()) return;
    await publishReport(fixture);
    const ageBand: FaithAgeBandFixture = {
      id: randomUUID(),
      tenantId: fixture.tenantAId,
      name: "No-context Juniors",
      minimumAge: 8,
      maximumAge: 12,
    };
    await withReportsRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      async (tx) => {
        await createFaithAgeBand(tx, ageBand);
        const publication = await publishFaithContent(tx, fixture, [
          { type: "AGE_BAND", ageBand },
        ]);
        await insertFaithReadReceipt(tx, fixture, publication.versionId);
        await insertFaithReflection(tx, fixture, publication.versionId);
      },
    );

    await prisma.$transaction(async (noContext) => {
      if (useTenantRlsRole()) {
        await noContext.$executeRawUnsafe(
          `SET LOCAL ROLE "${TENANT_RLS_ROLE}"`,
        );
      }
      await noContext.$executeRawUnsafe(
        "SELECT pg_catalog.set_config('app.tenant_id', '', true)",
      );
      for (const tableName of F18_TABLES) {
        const [{ count }] = await noContext.$queryRawUnsafe<CountRow[]>(
          `SELECT count(*)::int AS count FROM "${tableName}"`,
        );
        expect(count).toBe(0);
      }
    });
  });
});
