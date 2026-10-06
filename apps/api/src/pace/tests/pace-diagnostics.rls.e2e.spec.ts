import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface DiagnosticFixture {
  orgAId: string;
  orgBId: string;
  tenantAId: string;
  tenantA2Id: string;
  tenantBId: string;
  childAId: string;
  childBId: string;
  subjectAId: string;
  subjectBId: string;
  enrollmentAId: string;
  enrollmentBId: string;
  actorAId: string;
  actorBId: string;
}

async function withDiagnosticRls<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (process.env.E2E_USE_GLOBAL_SETUP === "true") {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    }
    return callback(tx);
  });
}

async function expectSqlRejection(
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
  throw new Error(`Expected PostgreSQL rejection ${postgresCode}`);
}

async function insertResult(
  tx: Prisma.TransactionClient,
  fixture: DiagnosticFixture,
  options: Partial<{
    tenantId: string;
    childId: string;
    subjectId: string;
    enrollmentId: string;
    actorId: string;
    level: number;
  }> = {},
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "PaceDiagnosticResult" (
      "id", "tenantId", "childId", "subjectId", "enrollmentId",
      "level", "outcome", "recordedByUserId"
    ) VALUES (
      ${id}, ${options.tenantId ?? fixture.tenantAId},
      ${options.childId ?? fixture.childAId},
      ${options.subjectId ?? fixture.subjectAId},
      ${options.enrollmentId ?? fixture.enrollmentAId},
      ${options.level ?? 3}, 'PASS', ${options.actorId ?? fixture.actorAId}
    )
  `;
  return id;
}

async function insertRetraction(
  tx: Prisma.TransactionClient,
  fixture: DiagnosticFixture,
  resultId: string,
  reason = "Recorded against the wrong diagnostic sheet",
  actorId = fixture.actorAId,
): Promise<string> {
  const id = randomUUID();
  await tx.$executeRaw`
    INSERT INTO "PaceDiagnosticRetraction" (
      "id", "tenantId", "resultId", "reason", "retractedByUserId"
    ) VALUES (
      ${id}, ${fixture.tenantAId}, ${resultId}, ${reason}, ${actorId}
    )
  `;
  return id;
}

describe("ACE PACE diagnostic fact storage", () => {
  let fixture: DiagnosticFixture;

  it("forces tenant RLS and withholds Data API table grants", async () => {
    if (!isDatabaseAvailable()) return;

    const tables = await prisma.$queryRaw<
      Array<{
        tableName: string;
        enabled: boolean;
        forced: boolean;
        publicOrDataApiGrant: boolean;
      }>
    >`
      SELECT c.relname AS "tableName",
             c.relrowsecurity AS "enabled",
             c.relforcerowsecurity AS "forced",
             EXISTS (
               SELECT 1
               FROM pg_catalog.aclexplode(
                 COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))
               ) AS grant_entry
               WHERE grant_entry.grantee = 0
                  OR grant_entry.grantee IN (
                    pg_catalog.to_regrole('anon')::oid,
                    pg_catalog.to_regrole('authenticated')::oid
                  )
             ) AS "publicOrDataApiGrant"
      FROM pg_catalog.pg_class AS c
      JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app'
        AND c.relname IN ('PaceDiagnosticResult', 'PaceDiagnosticRetraction')
      ORDER BY c.relname
    `;
    expect(tables).toEqual([
      {
        tableName: "PaceDiagnosticResult",
        enabled: true,
        forced: true,
        publicOrDataApiGrant: false,
      },
      {
        tableName: "PaceDiagnosticRetraction",
        enabled: true,
        forced: true,
        publicOrDataApiGrant: false,
      },
    ]);
  });

  beforeAll(async () => {
    if (!requireDatabase()) return;

    fixture = {
      orgAId: randomUUID(),
      orgBId: randomUUID(),
      tenantAId: randomUUID(),
      tenantA2Id: randomUUID(),
      tenantBId: randomUUID(),
      childAId: randomUUID(),
      childBId: randomUUID(),
      subjectAId: randomUUID(),
      subjectBId: randomUUID(),
      enrollmentAId: randomUUID(),
      enrollmentBId: randomUUID(),
      actorAId: randomUUID(),
      actorBId: randomUUID(),
    };

    await prisma.org.createMany({
      data: [
        {
          id: fixture.orgAId,
          name: "Diagnostic org A",
          slug: `diagnostic-a-${fixture.orgAId}`,
          planCode: "trial",
        },
        {
          id: fixture.orgBId,
          name: "Diagnostic org B",
          slug: `diagnostic-b-${fixture.orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.tenant.create({
      data: {
        id: fixture.tenantA2Id,
        orgId: fixture.orgAId,
        name: "Diagnostic second site",
        slug: `diagnostic-second-${fixture.tenantA2Id}`,
      },
    });

    for (const site of [
      {
        orgId: fixture.orgAId,
        tenantId: fixture.tenantAId,
        actorId: fixture.actorAId,
        childId: fixture.childAId,
        subjectId: fixture.subjectAId,
        enrollmentId: fixture.enrollmentAId,
      },
      {
        orgId: fixture.orgBId,
        tenantId: fixture.tenantBId,
        actorId: fixture.actorBId,
        childId: fixture.childBId,
        subjectId: fixture.subjectBId,
        enrollmentId: fixture.enrollmentBId,
      },
    ]) {
      await prisma.tenant.create({
        data: {
          id: site.tenantId,
          orgId: site.orgId,
          name: `Diagnostic site ${site.tenantId}`,
          slug: `diagnostic-${site.tenantId}`,
        },
      });
      await withTenantRlsContext(site.tenantId, site.orgId, async (tx) => {
        await tx.user.create({
          data: {
            id: site.actorId,
            email: `${site.actorId}@example.test`,
            tenantId: site.tenantId,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId: site.tenantId, userId: site.actorId },
        });
        await tx.child.create({
          data: {
            id: site.childId,
            firstName: "Diagnostic",
            lastName: "Student",
            tenantId: site.tenantId,
          },
        });
        await tx.subject.create({
          data: {
            id: site.subjectId,
            tenantId: site.tenantId,
            name: `Diagnostic subject ${site.subjectId}`,
          },
        });
        await tx.studentSubjectEnrollment.create({
          data: {
            id: site.enrollmentId,
            tenantId: site.tenantId,
            childId: site.childId,
            subjectId: site.subjectId,
            startsOn: new Date("2026-01-01T00:00:00.000Z"),
            startingPace: 1001,
            currentPace: 1001,
            targetPace: 1010,
            recordedByUserId: site.actorId,
            reason: "Initial subject placement",
          },
        });
      });
    }
  });

  afterEach(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PaceDiagnosticRetraction", "PaceDiagnosticResult"',
    );
    await prisma.studentSubjectEnrollment.update({
      where: { id: fixture.enrollmentAId },
      data: { status: "ACTIVE", endsOn: null },
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await prisma.studentSubjectEnrollment.deleteMany({
      where: { id: { in: [fixture.enrollmentAId, fixture.enrollmentBId] } },
    });
    await prisma.subject.deleteMany({
      where: { id: { in: [fixture.subjectAId, fixture.subjectBId] } },
    });
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
      where: {
        id: {
          in: [fixture.tenantAId, fixture.tenantA2Id, fixture.tenantBId],
        },
      },
    });
    await prisma.org.deleteMany({
      where: { id: { in: [fixture.orgAId, fixture.orgBId] } },
    });
  });

  it("allows same-site facts and hides them from another organisation", async () => {
    if (!isDatabaseAvailable()) return;

    const resultId = await withDiagnosticRls(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertResult(tx, fixture),
    );

    const visible = await withDiagnosticRls(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => tx.paceDiagnosticResult.findMany({ where: { id: resultId } }),
    );
    const hidden = await withDiagnosticRls(
      fixture.tenantBId,
      fixture.orgBId,
      (tx) => tx.paceDiagnosticResult.findMany({ where: { id: resultId } }),
    );
    const hiddenAtSecondSite = await withDiagnosticRls(
      fixture.tenantA2Id,
      fixture.orgAId,
      (tx) => tx.paceDiagnosticResult.findMany({ where: { id: resultId } }),
    );
    expect(visible).toHaveLength(1);
    expect(hidden).toHaveLength(0);
    expect(hiddenAtSecondSite).toHaveLength(0);

    await expectSqlRejection(
      () =>
        withDiagnosticRls(fixture.tenantBId, fixture.orgBId, (tx) =>
          insertResult(tx, fixture),
        ),
      "42501",
    );
  });

  it("rejects invalid levels, inactive or mismatched enrollments, and non-member actors", async () => {
    if (!isDatabaseAvailable()) return;

    for (const [options, code] of [
      [{ level: 0 }, "23514"],
      [{ childId: fixture.childBId }, "23514"],
      [{ actorId: fixture.actorBId }, "23503"],
    ] as const) {
      await expectSqlRejection(
        () =>
          withDiagnosticRls(fixture.tenantAId, fixture.orgAId, (tx) =>
            insertResult(tx, fixture, options),
          ),
        code,
      );
    }

    await prisma.studentSubjectEnrollment.update({
      where: { id: fixture.enrollmentAId },
      data: { status: "ENDED", endsOn: new Date("2026-10-06T00:00:00.000Z") },
    });
    await expectSqlRejection(
      () =>
        withDiagnosticRls(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertResult(tx, fixture),
        ),
      "23514",
    );
  });

  it("retains results and permits one immutable retraction after enrollment ends", async () => {
    if (!isDatabaseAvailable()) return;

    const resultId = await withDiagnosticRls(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertResult(tx, fixture),
    );
    await prisma.studentSubjectEnrollment.update({
      where: { id: fixture.enrollmentAId },
      data: { status: "ENDED", endsOn: new Date("2026-10-06T00:00:00.000Z") },
    });

    const retractionId = await withDiagnosticRls(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) => insertRetraction(tx, fixture, resultId),
    );
    const [result, retraction] = await withDiagnosticRls(
      fixture.tenantAId,
      fixture.orgAId,
      (tx) =>
        Promise.all([
          tx.paceDiagnosticResult.findUnique({ where: { id: resultId } }),
          tx.paceDiagnosticRetraction.findUnique({
            where: { id: retractionId },
          }),
        ]),
    );
    expect(result?.id).toBe(resultId);
    expect(retraction?.resultId).toBe(resultId);
    const hiddenRetractions = await withDiagnosticRls(
      fixture.tenantA2Id,
      fixture.orgAId,
      (tx) =>
        tx.paceDiagnosticRetraction.findMany({ where: { id: retractionId } }),
    );
    expect(hiddenRetractions).toHaveLength(0);
    await expectSqlRejection(
      () =>
        withDiagnosticRls(fixture.tenantA2Id, fixture.orgAId, (tx) =>
          insertRetraction(tx, fixture, resultId),
        ),
      "42501",
    );

    await expectSqlRejection(
      () =>
        withDiagnosticRls(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertRetraction(tx, fixture, resultId),
        ),
      "23505",
    );
    await expectSqlRejection(
      () =>
        withDiagnosticRls(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertRetraction(tx, fixture, resultId, "  "),
        ),
      "23514",
    );
    await expectSqlRejection(
      () =>
        withDiagnosticRls(fixture.tenantAId, fixture.orgAId, (tx) =>
          insertRetraction(
            tx,
            fixture,
            resultId,
            "Wrong actor",
            fixture.actorBId,
          ),
        ),
      "23503",
    );

    for (const operation of [
      () =>
        withDiagnosticRls(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`UPDATE "PaceDiagnosticResult" SET "level" = 5 WHERE "id" = ${resultId}`,
        ),
      () =>
        withDiagnosticRls(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`DELETE FROM "PaceDiagnosticResult" WHERE "id" = ${resultId}`,
        ),
      () =>
        withDiagnosticRls(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`UPDATE "PaceDiagnosticRetraction" SET "reason" = 'changed' WHERE "id" = ${retractionId}`,
        ),
      () =>
        withDiagnosticRls(
          fixture.tenantAId,
          fixture.orgAId,
          (tx) =>
            tx.$executeRaw`DELETE FROM "PaceDiagnosticRetraction" WHERE "id" = ${retractionId}`,
        ),
    ]) {
      await expectSqlRejection(operation, "55000");
    }
  });
});
