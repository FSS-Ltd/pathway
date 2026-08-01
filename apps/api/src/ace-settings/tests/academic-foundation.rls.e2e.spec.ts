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

interface AcademicFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantBId: string;
  childAId: string;
  childBId: string;
  subjectAId: string;
  actorAId: string;
  actorBId: string;
}

function useTenantRlsRole(): boolean {
  return process.env.E2E_USE_GLOBAL_SETUP === "true";
}

async function withAcademicRlsContext<T>(
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

async function insertAcademicYear(
  tx: Prisma.TransactionClient,
  tenantId: string,
  name: string,
): Promise<string> {
  const academicYearId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AcademicYear" (
      "id", "tenantId", "name", "startsOn", "endsOn", "status"
    ) VALUES (
      ${academicYearId},
      ${tenantId},
      ${name},
      ${new Date("2026-09-01T00:00:00.000Z")},
      ${new Date("2027-07-31T00:00:00.000Z")},
      'ACTIVE'
    )
  `;
  return academicYearId;
}

async function insertAcademicPeriod(
  tx: Prisma.TransactionClient,
  tenantId: string,
  academicYearId: string,
  startsOn: Date,
  endsOn: Date,
): Promise<string> {
  const academicPeriodId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "AcademicPeriod" (
      "id", "tenantId", "academicYearId", "name", "startsOn", "endsOn", "status"
    ) VALUES (
      ${academicPeriodId},
      ${tenantId},
      ${academicYearId},
      ${`Term ${academicPeriodId}`},
      ${startsOn},
      ${endsOn},
      'ACTIVE'
    )
  `;
  return academicPeriodId;
}

async function insertActiveEnrollment(
  tx: Prisma.TransactionClient,
  fixture: AcademicFixture,
  recordedByUserId = fixture.actorAId,
): Promise<string> {
  const enrollmentId = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "StudentSubjectEnrollment" (
      "id", "tenantId", "childId", "subjectId", "startsOn", "status",
      "startingPace", "currentPace", "targetPace", "recordedByUserId", "reason"
    ) VALUES (
      ${enrollmentId},
      ${fixture.tenantAId},
      ${fixture.childAId},
      ${fixture.subjectAId},
      ${new Date("2026-09-01T00:00:00.000Z")},
      'ACTIVE',
      2,
      3,
      5,
      ${recordedByUserId},
      'Initial subject placement'
    )
  `;
  return enrollmentId;
}

async function deleteAcademicRowsIfPresent(
  client: PrismaClientType,
  fixture: AcademicFixture,
): Promise<void> {
  const [row] = await client.$queryRaw<Array<{ exists: string | null }>>`
    SELECT to_regclass('app."StudentSubjectEnrollment"')::text AS "exists"
  `;

  if (!row?.exists) return;

  await client.$executeRaw`
    DELETE FROM "StudentSubjectEnrollment"
    WHERE "tenantId" IN (${fixture.tenantAId}, ${fixture.tenantBId})
  `;
  await client.$executeRaw`
    DELETE FROM "AcademicPeriod"
    WHERE "tenantId" IN (${fixture.tenantAId}, ${fixture.tenantBId})
  `;
  await client.$executeRaw`
    DELETE FROM "AcademicYear"
    WHERE "tenantId" IN (${fixture.tenantAId}, ${fixture.tenantBId})
  `;
}

describe("ACE academic foundation RLS", () => {
  let fixture: AcademicFixture;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    const orgAId = randomUUID();
    const orgBId = randomUUID();
    const tenantAId = randomUUID();
    const tenantBId = randomUUID();
    const childAId = randomUUID();
    const childBId = randomUUID();
    const subjectAId = randomUUID();
    const actorAId = randomUUID();
    const actorBId = randomUUID();

    await prisma.org.createMany({
      data: [
        {
          id: orgAId,
          name: `Academic org A ${orgAId}`,
          slug: `academic-a-${orgAId}`,
          planCode: "trial",
        },
        {
          id: orgBId,
          name: `Academic org B ${orgBId}`,
          slug: `academic-b-${orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantAId,
          orgId: orgAId,
          name: `Academic tenant A ${tenantAId}`,
          slug: `academic-a-${tenantAId}`,
        },
        {
          id: tenantBId,
          orgId: orgBId,
          name: `Academic tenant B ${tenantBId}`,
          slug: `academic-b-${tenantBId}`,
        },
      ],
    });

    await withTenantRlsContext(tenantAId, orgAId, async (tx) => {
      await tx.user.create({
        data: {
          id: actorAId,
          email: `${actorAId}@example.test`,
          tenantId: tenantAId,
        },
      });
      await tx.siteMembership.create({
        data: { tenantId: tenantAId, userId: actorAId },
      });
      await tx.child.create({
        data: {
          id: childAId,
          firstName: "Academic",
          lastName: "Child A",
          tenantId: tenantAId,
        },
      });
      await tx.subject.create({
        data: {
          id: subjectAId,
          name: `Subject ${subjectAId}`,
          tenantId: tenantAId,
        },
      });
    });
    await withTenantRlsContext(tenantBId, orgBId, async (tx) => {
      await tx.user.create({
        data: {
          id: actorBId,
          email: `${actorBId}@example.test`,
          tenantId: tenantBId,
        },
      });
      await tx.child.create({
        data: {
          id: childBId,
          firstName: "Academic",
          lastName: "Child B",
          tenantId: tenantBId,
        },
      });
    });
    await withTenantRlsContext(tenantBId, orgBId, (tx) =>
      tx.siteMembership.create({
        data: { tenantId: tenantBId, userId: actorBId },
      }),
    );

    fixture = {
      orgAId,
      orgBId,
      tenantAId,
      tenantBId,
      childAId,
      childBId,
      subjectAId,
      actorAId,
      actorBId,
    };
  });

  afterEach(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await deleteAcademicRowsIfPresent(prisma, fixture);
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;

    await deleteAcademicRowsIfPresent(prisma, fixture);
    await prisma.subject.deleteMany({ where: { id: fixture.subjectAId } });
    await prisma.child.deleteMany({
      where: { id: { in: [fixture.childAId, fixture.childBId] } },
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

  it("allows only one active academic year per tenant", async () => {
    if (!isDatabaseAvailable()) return;

    await withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertAcademicYear(tx, fixture.tenantAId, "2026/27"),
    );

    await expectDatabaseRejection(
      () =>
        withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertAcademicYear(tx, fixture.tenantAId, "2027/28"),
        ),
      "23505",
    );
  });

  it("rejects overlapping active academic periods", async () => {
    if (!isDatabaseAvailable()) return;

    const academicYearId = await withAcademicRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertAcademicYear(tx, fixture.tenantAId, "2026/27"),
    );
    await withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertAcademicPeriod(
        tx,
        fixture.tenantAId,
        academicYearId,
        new Date("2026-09-01T00:00:00.000Z"),
        new Date("2026-12-31T00:00:00.000Z"),
      ),
    );

    await expectDatabaseRejection(
      () =>
        withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertAcademicPeriod(
            tx,
            fixture.tenantAId,
            academicYearId,
            new Date("2026-12-01T00:00:00.000Z"),
            new Date("2027-03-31T00:00:00.000Z"),
          ),
        ),
      "23P01",
    );
  });

  it("rejects duplicate active enrolment for one child and subject", async () => {
    if (!isDatabaseAvailable()) return;

    await withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
      insertActiveEnrollment(tx, fixture),
    );

    await expectDatabaseRejection(
      () =>
        withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertActiveEnrollment(tx, fixture),
        ),
      "23505",
    );
  });

  it("stores placement PACE and its actor and reason", async () => {
    if (!isDatabaseAvailable()) return;

    const enrollmentId = await withAcademicRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertActiveEnrollment(tx, fixture),
    );
    const [placement] = await withAcademicRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        tx.$queryRaw<
          Array<{
            startingPace: number;
            currentPace: number;
            targetPace: number;
            recordedByUserId: string;
            reason: string;
          }>
        >`
          SELECT "startingPace", "currentPace", "targetPace", "recordedByUserId", "reason"
          FROM "StudentSubjectEnrollment"
          WHERE "id" = ${enrollmentId}
        `,
    );

    expect(placement).toEqual({
      startingPace: 2,
      currentPace: 3,
      targetPace: 5,
      recordedByUserId: fixture.actorAId,
      reason: "Initial subject placement",
    });
  });

  it("rejects an enrolment with a child from another tenant", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withAcademicRlsContext(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`
            INSERT INTO "StudentSubjectEnrollment" (
              "id", "tenantId", "childId", "subjectId", "startsOn", "status",
              "startingPace", "currentPace", "targetPace", "recordedByUserId", "reason"
            ) VALUES (
              ${randomUUID()},
              ${fixture.tenantAId},
              ${fixture.childBId},
              ${fixture.subjectAId},
              ${new Date("2026-09-01T00:00:00.000Z")},
              'ACTIVE',
              2,
              2,
              5,
              ${fixture.actorAId},
              'Invalid tenant swap'
            )
          `,
        ),
      "23503",
    );
  });

  it("rejects an enrolment recorded by an actor from another tenant", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withAcademicRlsContext(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertActiveEnrollment(tx, fixture, fixture.actorBId),
        ),
      "23503",
    );
  });

  it("does not allow tenant B to create academic data for tenant A", async () => {
    if (!isDatabaseAvailable()) return;

    await expectDatabaseRejection(
      () =>
        withAcademicRlsContext(fixture.tenantBId, fixture.orgBId, (tx) =>
          insertAcademicYear(tx, fixture.tenantAId, "Cross-tenant year"),
        ),
      "42501",
    );
  });

  it("does not expose academic enrolments to another tenant", async () => {
    if (!isDatabaseAvailable()) return;

    const enrollmentId = await withAcademicRlsContext(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertActiveEnrollment(tx, fixture),
    );
    const rows = await withAcademicRlsContext(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) =>
        tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id"
          FROM "StudentSubjectEnrollment"
          WHERE "id" = ${enrollmentId}
        `,
    );

    expect(rows).toEqual([]);
  });
});
