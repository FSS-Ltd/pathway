import { randomUUID } from "node:crypto";
import {
  Prisma,
  prisma,
  runTransaction,
  withTenantRlsContext,
  type PrismaClientType,
} from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface CommunityFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  staffAId: string;
  staffBId: string;
  unassignedStaffAId: string;
  studentManualUserId: string;
  studentLowerBoundaryUserId: string;
  studentPastUpperBoundaryUserId: string;
  childManualId: string;
  childLowerBoundaryId: string;
  childPastUpperBoundaryId: string;
  childBId: string;
  concernAId: string;
  concernBId: string;
}

interface CommunityCounts {
  policy: bigint;
  group: bigint;
  childMember: bigint;
  staffMember: bigint;
  post: bigint;
  reply: bigint;
  readCursor: bigint;
  report: bigint;
  moderationAction: bigint;
  safeguardingReference: bigint;
}

const COMMUNITY_MODEL_NAMES = [
  "AceCommunityPolicy",
  "AceCommunityGroup",
  "AceCommunityGroupChildMember",
  "AceCommunityGroupStaffMember",
  "AceCommunityPost",
  "AceCommunityReply",
  "AceCommunityReadCursor",
  "AceCommunityReport",
  "AceCommunityModerationAction",
  "AceCommunitySafeguardingReference",
] as const;

const NO_COMMUNITY_ROWS: CommunityCounts[] = [{
  policy: 0n,
  group: 0n,
  childMember: 0n,
  staffMember: 0n,
  post: 0n,
  reply: 0n,
  readCursor: 0n,
  report: 0n,
  moderationAction: 0n,
  safeguardingReference: 0n,
}];

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

function utcDateYearsAgo(years: number): Date {
  const today = new Date();
  return new Date(Date.UTC(
    today.getUTCFullYear() - years,
    today.getUTCMonth(),
    today.getUTCDate(),
  ));
}

async function withCommunityRlsContext<T>(
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

async function withNoTenantRlsContext<T>(
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return runTransaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    await tx.$executeRawUnsafe("SET LOCAL row_security = on");
    return callback(tx);
  });
}

async function expectDatabaseRejection(
  tx: Prisma.TransactionClient,
  operation: () => Promise<unknown>,
  postgresCode: string,
): Promise<void> {
  await tx.$executeRawUnsafe("SAVEPOINT expected_database_rejection");

  try {
    await operation();
  } catch (error) {
    await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT expected_database_rejection");
    await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_database_rejection");
    expect(error).toMatchObject({
      code: "P2010",
      meta: { code: postgresCode },
    });
    return;
  }

  await tx.$executeRawUnsafe("RELEASE SAVEPOINT expected_database_rejection");
  throw new Error("Expected the database operation to be rejected");
}

async function readCommunityCounts(
  client: Pick<Prisma.TransactionClient, "$queryRaw">,
): Promise<CommunityCounts[]> {
  return client.$queryRaw<CommunityCounts[]>`
    SELECT
      (SELECT count(*) FROM "AceCommunityPolicy") AS "policy",
      (SELECT count(*) FROM "AceCommunityGroup") AS "group",
      (SELECT count(*) FROM "AceCommunityGroupChildMember") AS "childMember",
      (SELECT count(*) FROM "AceCommunityGroupStaffMember") AS "staffMember",
      (SELECT count(*) FROM "AceCommunityPost") AS "post",
      (SELECT count(*) FROM "AceCommunityReply") AS "reply",
      (SELECT count(*) FROM "AceCommunityReadCursor") AS "readCursor",
      (SELECT count(*) FROM "AceCommunityReport") AS "report",
      (SELECT count(*) FROM "AceCommunityModerationAction") AS "moderationAction",
      (SELECT count(*) FROM "AceCommunitySafeguardingReference") AS "safeguardingReference"
  `;
}

async function insertPolicy(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  communityEnabled = true,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "AceCommunityPolicy" ("tenantId", "communityEnabled")
    VALUES (${fixture.tenantAId}, ${communityEnabled})
  `;
}

async function insertGroup(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  options: {
    membershipMode?: "MANUAL" | "AGE_RANGE";
    minimumAge?: number;
    maximumAge?: number;
  } = {},
): Promise<string> {
  const id = randomUUID();
  const name = `Community group ${id}`;
  const membershipMode = options.membershipMode ?? "MANUAL";
  await tx.$executeRaw`
    INSERT INTO "AceCommunityGroup" (
      "id", "tenantId", "name", "membershipMode", "minimumAge", "maximumAge", "createdByUserId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${name},
      ${membershipMode}::"AceCommunityGroupMembershipMode",
      ${options.minimumAge ?? null}, ${options.maximumAge ?? null}, ${fixture.staffAId}
    )
  `;
  return id;
}

async function addManualChildMember(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  groupId: string,
  childId = fixture.childManualId,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "AceCommunityGroupChildMember" ("id", "tenantId", "groupId", "childId")
    VALUES (${randomUUID()}, ${fixture.tenantAId}, ${groupId}, ${childId})
  `;
}

async function addStaffMember(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  groupId: string,
  staffUserId = fixture.staffAId,
): Promise<void> {
  await tx.$executeRaw`
    INSERT INTO "AceCommunityGroupStaffMember" (
      "id", "tenantId", "groupId", "staffUserId", "role"
    ) VALUES (
      ${randomUUID()}, ${fixture.tenantAId}, ${groupId}, ${staffUserId},
      'MEMBER'::"AceCommunityGroupStaffRole"
    )
  `;
}

async function insertPost(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  options: {
    groupId: string;
    authorUserId?: string;
    body?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceCommunityPost" (
      "id", "tenantId", "groupId", "authorUserId", "body"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.groupId},
      ${options.authorUserId ?? fixture.studentManualUserId},
      ${options.body ?? "A school-owned Community post."}
    )
  `;
  return id;
}

async function insertReply(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  options: {
    groupId: string;
    postId: string;
    authorUserId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceCommunityReply" (
      "id", "tenantId", "groupId", "postId", "authorUserId", "body"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.groupId}, ${options.postId},
      ${options.authorUserId ?? fixture.studentManualUserId}, 'A reply in the same group.'
    )
  `;
  return id;
}

async function insertReport(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  options: {
    groupId: string;
    postId?: string;
    replyId?: string;
  },
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceCommunityReport" (
      "id", "tenantId", "groupId", "postId", "replyId", "reportedByUserId", "reason", "evidenceSnapshot"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${options.groupId}, ${options.postId ?? null}, ${options.replyId ?? null},
      ${fixture.staffAId}, 'GUIDELINE_BREACH'::"AceCommunityReportReason", 'Original report evidence.'
    )
  `;
  return id;
}

async function insertModerationAction(
  tx: Prisma.TransactionClient,
  fixture: CommunityFixture,
  groupId: string,
  reportId: string,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AceCommunityModerationAction" (
      "id", "tenantId", "groupId", "reportId", "moderatorUserId", "actionType", "reason", "evidenceSnapshot"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${groupId}, ${reportId}, ${fixture.staffAId},
      'HIDE'::"AceCommunityModerationActionType", 'School moderation decision.', 'Original moderation evidence.'
    )
  `;
  return id;
}

async function deleteCommunityRowsIfPresent(
  client: PrismaClientType,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."AceCommunityGroup"')::text AS "exists"
  `;
  if (!row?.exists) return;

  await client.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AceCommunitySafeguardingReference",
      "AceCommunityModerationAction",
      "AceCommunityReport",
      "AceCommunityReply",
      "AceCommunityPost",
      "AceCommunityReadCursor",
      "AceCommunityGroupStaffMember",
      "AceCommunityGroupChildMember",
      "AceCommunityGroup",
      "AceCommunityPolicy"
  `);
}

function communityModelAndFieldNames(): string[] {
  return Prisma.dmmf.datamodel.models
    .filter((model) => model.name.startsWith("AceCommunity"))
    .flatMap((model) => [model.name, ...model.fields.map((field) => field.name)]);
}

describe("ACE school Community storage", () => {
  let fixture: CommunityFixture;

  it("exposes only the approved school Community model family and no direct-message topology", () => {
    const names = communityModelAndFieldNames();
    expect(
      Prisma.dmmf.datamodel.models
        .filter((model) => model.name.startsWith("AceCommunity"))
        .map((model) => model.name)
        .sort(),
    ).toEqual([...COMMUNITY_MODEL_NAMES].sort());
    for (const name of names) {
      expect(name).not.toMatch(/participant|recipient|conversation|directmessage/i);
    }
  });

  beforeAll(async () => {
    if (!requireDatabase()) return;

    fixture = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      staffAId: randomUUID(),
      staffBId: randomUUID(),
      unassignedStaffAId: randomUUID(),
      studentManualUserId: randomUUID(),
      studentLowerBoundaryUserId: randomUUID(),
      studentPastUpperBoundaryUserId: randomUUID(),
      childManualId: randomUUID(),
      childLowerBoundaryId: randomUUID(),
      childPastUpperBoundaryId: randomUUID(),
      childBId: randomUUID(),
      concernAId: randomUUID(),
      concernBId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        { id: fixture.orgAId, name: `Community org A ${fixture.orgAId}`, slug: `community-a-${fixture.orgAId}`, planCode: "trial" },
        { id: fixture.orgBId, name: `Community org B ${fixture.orgBId}`, slug: `community-b-${fixture.orgBId}`, planCode: "trial" },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        { id: fixture.tenantAId, orgId: fixture.orgAId, name: `Community tenant A ${fixture.tenantAId}`, slug: `community-a-${fixture.tenantAId}`, timezone: "UTC" },
        { id: fixture.tenantBId, orgId: fixture.orgBId, name: `Community tenant B ${fixture.tenantBId}`, slug: `community-b-${fixture.tenantBId}`, timezone: "UTC" },
      ],
    });

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await tx.user.createMany({
        data: [
          fixture.staffAId,
          fixture.unassignedStaffAId,
          fixture.studentManualUserId,
          fixture.studentLowerBoundaryUserId,
          fixture.studentPastUpperBoundaryUserId,
        ].map((id) => ({ id, email: `${id}@example.test`, tenantId: fixture.tenantAId })),
      });
      await tx.siteMembership.createMany({
        data: [fixture.staffAId, fixture.unassignedStaffAId].map((userId) => ({
          tenantId: fixture.tenantAId,
          userId,
        })),
      });
      await tx.child.createMany({
        data: [
          { id: fixture.childManualId, firstName: "Manual", lastName: "Student", tenantId: fixture.tenantAId, dateOfBirth: utcDateYearsAgo(11) },
          { id: fixture.childLowerBoundaryId, firstName: "Lower", lastName: "Boundary", tenantId: fixture.tenantAId, dateOfBirth: utcDateYearsAgo(10) },
          { id: fixture.childPastUpperBoundaryId, firstName: "Past", lastName: "Boundary", tenantId: fixture.tenantAId, dateOfBirth: utcDateYearsAgo(13) },
        ],
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: fixture.tenantAId, studentPortalEnabled: true },
      });
      await insertStudentIdentityLink(tx, fixture.tenantAId, fixture.studentManualUserId, fixture.childManualId);
      await insertStudentIdentityLink(tx, fixture.tenantAId, fixture.studentLowerBoundaryUserId, fixture.childLowerBoundaryId);
      await insertStudentIdentityLink(tx, fixture.tenantAId, fixture.studentPastUpperBoundaryUserId, fixture.childPastUpperBoundaryId);
    });

    await withCommunityRlsContext(fixture.tenantBId, fixture.orgBId, async (tx) => {
      await tx.user.create({
        data: { id: fixture.staffBId, email: `${fixture.staffBId}@example.test`, tenantId: fixture.tenantBId },
      });
      await tx.siteMembership.create({ data: { tenantId: fixture.tenantBId, userId: fixture.staffBId } });
      await tx.child.create({
        data: { id: fixture.childBId, firstName: "Other", lastName: "Tenant", tenantId: fixture.tenantBId },
      });
    });
    await prisma.concern.createMany({
      data: [
        {
          id: fixture.concernAId,
          childId: fixture.childManualId,
          summary: "A safeguarding case in this tenant.",
        },
        {
          id: fixture.concernBId,
          childId: fixture.childBId,
          summary: "A safeguarding case in another tenant.",
        },
      ],
    });
  });

  afterEach(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteCommunityRowsIfPresent(prisma);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await deleteCommunityRowsIfPresent(prisma);
    await prisma.concern.deleteMany({
      where: { id: { in: [fixture.concernAId, fixture.concernBId] } },
    });
    await prisma.studentIdentityLink.deleteMany({ where: { tenantId: fixture.tenantAId } });
    await prisma.studentIdentity.deleteMany({ where: { tenantId: fixture.tenantAId } });
    await prisma.studentPortalPolicy.deleteMany({ where: { tenantId: fixture.tenantAId } });
    await prisma.child.deleteMany({
      where: {
        id: {
          in: [
            fixture.childManualId,
            fixture.childLowerBoundaryId,
            fixture.childPastUpperBoundaryId,
            fixture.childBId,
          ],
        },
      },
    });
    await prisma.siteMembership.deleteMany({
      where: { userId: { in: [fixture.staffAId, fixture.unassignedStaffAId, fixture.staffBId] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            fixture.staffAId,
            fixture.unassignedStaffAId,
            fixture.staffBId,
            fixture.studentManualUserId,
            fixture.studentLowerBoundaryUserId,
            fixture.studentPastUpperBoundaryUserId,
          ],
        },
      },
    });
    await prisma.tenant.deleteMany({ where: { id: { in: [fixture.tenantAId, fixture.tenantBId] } } });
    await prisma.org.deleteMany({ where: { id: { in: [fixture.orgAId, fixture.orgBId] } } });
  });

  it("fails closed for missing or disabled policy, and enforces manual child membership", async () => {
    if (!isDatabaseAvailable()) return;

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      const groupId = await insertGroup(tx, fixture);
      await addManualChildMember(tx, fixture, groupId);
      await expectDatabaseRejection(tx, () => insertPost(tx, fixture, { groupId }), "23514");

      await insertPolicy(tx, fixture, false);
      await expectDatabaseRejection(tx, () => insertPost(tx, fixture, { groupId }), "23514");

      await tx.$executeRaw`UPDATE "AceCommunityPolicy" SET "communityEnabled" = true WHERE "tenantId" = ${fixture.tenantAId}`;
      await insertPost(tx, fixture, { groupId });
      await tx.$executeRaw`
        DELETE FROM "AceCommunityGroupChildMember"
        WHERE "groupId" = ${groupId} AND "childId" = ${fixture.childManualId}
      `;
      await expectDatabaseRejection(tx, () => insertPost(tx, fixture, { groupId }), "23514");
    });
  });

  it("calculates inclusive age-range membership without a mutable membership projection", async () => {
    if (!isDatabaseAvailable()) return;

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertPolicy(tx, fixture);
      const groupId = await insertGroup(tx, fixture, {
        membershipMode: "AGE_RANGE",
        minimumAge: 10,
        maximumAge: 12,
      });
      await insertPost(tx, fixture, {
        groupId,
        authorUserId: fixture.studentLowerBoundaryUserId,
      });
      await expectDatabaseRejection(
        tx,
        () => insertPost(tx, fixture, {
          groupId,
          authorUserId: fixture.studentPastUpperBoundaryUserId,
        }),
        "23514",
      );
      await expectDatabaseRejection(
        tx,
        () => addManualChildMember(tx, fixture, groupId, fixture.childLowerBoundaryId),
        "23514",
      );
    });
  });

  it("requires staff group assignment and a current student identity for authors", async () => {
    if (!isDatabaseAvailable()) return;

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertPolicy(tx, fixture);
      const groupId = await insertGroup(tx, fixture);
      await addManualChildMember(tx, fixture, groupId);
      await expectDatabaseRejection(
        tx,
        () => insertPost(tx, fixture, { groupId, authorUserId: fixture.unassignedStaffAId }),
        "23514",
      );
      await addStaffMember(tx, fixture, groupId);
      await insertPost(tx, fixture, { groupId, authorUserId: fixture.staffAId });

      await tx.$executeRaw`
        UPDATE "StudentIdentityLink"
        SET "endedAt" = CURRENT_TIMESTAMP
        WHERE "tenantId" = ${fixture.tenantAId} AND "childId" = ${fixture.childManualId}
      `;
      await expectDatabaseRejection(tx, () => insertPost(tx, fixture, { groupId }), "23514");
    });
  });

  it("keeps replies in the post group and makes reports and moderation evidence immutable", async () => {
    if (!isDatabaseAvailable()) return;

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertPolicy(tx, fixture);
      const firstGroupId = await insertGroup(tx, fixture);
      const secondGroupId = await insertGroup(tx, fixture);
      await addManualChildMember(tx, fixture, firstGroupId);
      await addManualChildMember(tx, fixture, secondGroupId);
      const postId = await insertPost(tx, fixture, { groupId: firstGroupId });
      await expectDatabaseRejection(
        tx,
        () => insertReply(tx, fixture, { groupId: secondGroupId, postId }),
        "23503",
      );
      await insertReply(tx, fixture, { groupId: firstGroupId, postId });
      await expectDatabaseRejection(
        tx,
        () => insertReport(tx, fixture, { groupId: firstGroupId, postId, replyId: randomUUID() }),
        "23514",
      );
      const reportId = await insertReport(tx, fixture, { groupId: firstGroupId, postId });
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          UPDATE "AceCommunityReport" SET "evidenceSnapshot" = 'changed'
          WHERE "id" = ${reportId}
        `,
        "55000",
      );
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`DELETE FROM "AceCommunityReport" WHERE "id" = ${reportId}`,
        "55000",
      );

      const actionId = await insertModerationAction(tx, fixture, firstGroupId, reportId);
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          UPDATE "AceCommunityModerationAction" SET "reason" = 'changed'
          WHERE "id" = ${actionId}
        `,
        "55000",
      );
      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`DELETE FROM "AceCommunityModerationAction" WHERE "id" = ${actionId}`,
        "55000",
      );
    });
  });

  it("preserves original content when it is hidden and rejects cross-tenant safeguarding references", async () => {
    if (!isDatabaseAvailable()) return;

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertPolicy(tx, fixture);
      const groupId = await insertGroup(tx, fixture);
      await addManualChildMember(tx, fixture, groupId);
      const body = "Original content preserved for school moderation.";
      const postId = await insertPost(tx, fixture, { groupId, body });
      const reportId = await insertReport(tx, fixture, { groupId, postId });
      await tx.$executeRaw`
        UPDATE "AceCommunityPost"
        SET "visibility" = 'HIDDEN'::"AceCommunityContentVisibility",
            "visibilityUpdatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${postId}
      `;
      const [post] = await tx.$queryRaw<Array<{ body: string; visibility: string }>>`
        SELECT "body", "visibility"::text AS "visibility"
        FROM "AceCommunityPost" WHERE "id" = ${postId}
      `;
      expect(post).toEqual({ body, visibility: "HIDDEN" });

      await expectDatabaseRejection(
        tx,
        () => tx.$executeRaw`
          INSERT INTO "AceCommunitySafeguardingReference" (
            "id", "tenantId", "reportId", "concernId"
          ) VALUES (
            ${randomUUID()}, ${fixture.tenantAId}, ${reportId}, ${fixture.concernBId}
          )
        `,
        "23514",
      );
    });
  });

  it("fails closed across tenant and missing-context Community reads", async () => {
    if (!isDatabaseAvailable()) return;

    await withCommunityRlsContext(fixture.tenantAId, fixture.orgAId, async (tx) => {
      await insertPolicy(tx, fixture);
      const groupId = await insertGroup(tx, fixture);
      await addManualChildMember(tx, fixture, groupId);
      await addStaffMember(tx, fixture, groupId);
      const postId = await insertPost(tx, fixture, { groupId });
      await insertReply(tx, fixture, { groupId, postId });
      await tx.$executeRaw`
        INSERT INTO "AceCommunityReadCursor" ("id", "tenantId", "groupId", "userId")
        VALUES (${randomUUID()}, ${fixture.tenantAId}, ${groupId}, ${fixture.studentManualUserId})
      `;
      const reportId = await insertReport(tx, fixture, { groupId, postId });
      const actionId = await insertModerationAction(tx, fixture, groupId, reportId);
      await tx.$executeRaw`
        INSERT INTO "AceCommunitySafeguardingReference" (
          "id", "tenantId", "moderationActionId", "concernId"
        ) VALUES (
          ${randomUUID()}, ${fixture.tenantAId}, ${actionId}, ${fixture.concernAId}
        )
      `;
    });

    if (!useTenantRlsRole()) return;

    const tenantBCounts = await withCommunityRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      readCommunityCounts,
    );
    expect(tenantBCounts).toEqual(NO_COMMUNITY_ROWS);
    const noContextCounts = await withNoTenantRlsContext(readCommunityCounts);
    expect(noContextCounts).toEqual(NO_COMMUNITY_ROWS);
  });
});

async function insertStudentIdentityLink(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  childId: string,
): Promise<void> {
  const identityId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "StudentIdentity" ("id", "tenantId", "userId")
    VALUES (${identityId}, ${tenantId}, ${userId})
  `;
  await tx.$executeRaw`
    INSERT INTO "StudentIdentityLink" ("id", "tenantId", "studentIdentityId", "childId")
    VALUES (${randomUUID()}, ${tenantId}, ${identityId}, ${childId})
  `;
}
