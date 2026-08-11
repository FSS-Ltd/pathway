import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient, prisma } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import { configureCiRlsRole } from "../../../test.global-setup.e2e";
import { PaceCommandService } from "../pace-command.service";
import {
  createPaceRebuildFixture,
  paceRebuildJobFor,
  seedPaceRebuildFixture,
  withPaceRebuildTenantContext,
  type PaceRebuildFixture,
} from "./pace-rebuild-worker.e2e-fixture";

const LOCK_WAIT_TIMEOUT_MS = 5_000;

interface HeldPaceLock {
  release(): Promise<void>;
}

async function holdPaceLock(
  tenantId: string,
  childId: string,
): Promise<HeldPaceLock> {
  let markAcquired: (() => void) | undefined;
  let releaseLock: (() => void) | undefined;
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve;
  });
  const releaseSignal = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const completion = prisma.$transaction(async (tx) => {
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ace-pace-assessment:${tenantId}:${childId}`}, 0))`,
    );
    markAcquired?.();
    await releaseSignal;
  });
  await Promise.race([
    acquired,
    completion.then(() => {
      throw new Error("PACE aggregate lock transaction ended early");
    }),
  ]);
  let released = false;
  return {
    async release() {
      if (!released) {
        released = true;
        releaseLock?.();
      }
      await completion;
    },
  };
}

async function waitingPaceLocks(
  observer: PrismaClient,
  tenantId: string,
  childId: string,
): Promise<number> {
  const [row] = await observer.$queryRaw<{ waitingCount: number }[]>(Prisma.sql`
    WITH lock_key AS (
      SELECT hashtextextended(${`ace-pace-assessment:${tenantId}:${childId}`}, 0) AS value
    )
    SELECT COUNT(*)::integer AS "waitingCount"
    FROM pg_catalog.pg_locks observed_lock
    CROSS JOIN lock_key
    WHERE observed_lock.locktype = 'advisory'
      AND observed_lock.granted = false
      AND observed_lock.classid::bigint =
        ((lock_key.value >> 32) & 4294967295)
      AND observed_lock.objid::bigint = (lock_key.value & 4294967295)
      AND observed_lock.objsubid = 1
  `);
  return row?.waitingCount ?? 0;
}

async function waitForWaitingPaceLocks(
  observer: PrismaClient,
  tenantId: string,
  childId: string,
  expectedCount: number,
): Promise<void> {
  const deadline = Date.now() + LOCK_WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await waitingPaceLocks(observer, tenantId, childId)) === expectedCount) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting for ${expectedCount} PACE lock waiters`);
}

async function cleanupFixture(fixture: PaceRebuildFixture): Promise<void> {
  const sites = [
    fixture.boundarySite,
    fixture.decoySite,
    fixture.recordSite,
    fixture.correctionSite,
  ];
  const tenantIds = sites.map(({ tenantId }) => tenantId);
  await prisma.outboxEvent.deleteMany({ where: { orgId: fixture.orgId } });
  await prisma.auditEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "PaceProgress", "PaceAssessment", "PacePolicyOverride", "PacePolicy" CASCADE',
  );
  await prisma.studentSubjectEnrollment.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.subject.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.child.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.siteMembership.deleteMany({
    where: { tenantId: { in: tenantIds } },
  });
  await prisma.user.deleteMany({
    where: { id: { in: sites.map(({ actorId }) => actorId) } },
  });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.org.deleteMany({ where: { id: fixture.orgId } });
}

describe("PACE projection rebuild PostgreSQL integration", () => {
  const fixture = createPaceRebuildFixture();
  const lockObserver = new PrismaClient();

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await configureCiRlsRole((statement) =>
      prisma.$executeRawUnsafe(statement),
    );
    await seedPaceRebuildFixture(fixture);
  });

  afterAll(async () => {
    let firstError: unknown;
    if (isDatabaseAvailable()) {
      try {
        await cleanupFixture(fixture);
      } catch (error) {
        firstError = error;
      }
    }
    try {
      await lockObserver.$disconnect();
    } catch (error) {
      firstError ??= error;
    }
    if (firstError) throw firstError;
  });

  it("isolates tenant batches and rebuilds exactly 500 facts while skipping 501 unchanged", async () => {
    if (!isDatabaseAvailable()) return;
    const [databaseRole] = await withPaceRebuildTenantContext(
      fixture.boundarySite.tenantId,
      fixture.orgId,
      (tx) =>
        tx.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
          SELECT rolsuper, rolbypassrls
          FROM pg_roles
          WHERE rolname = current_user
        `,
    );
    expect(databaseRole).toEqual({ rolsuper: false, rolbypassrls: false });
    const before = await Promise.all(
      [fixture.boundarySite, fixture.decoySite].map((site) =>
        withPaceRebuildTenantContext(site.tenantId, fixture.orgId, (tx) =>
          tx.paceAssessment.count({ where: { tenantId: site.tenantId } }),
        ),
      ),
    );
    const oversizedBefore = await withPaceRebuildTenantContext(
      fixture.boundarySite.tenantId,
      fixture.orgId,
      (tx) =>
        tx.paceProgress.findUniqueOrThrow({
          where: {
            tenantId_childId_subjectId: {
              tenantId: fixture.boundarySite.tenantId,
              childId: fixture.oversized.childId,
              subjectId: fixture.oversized.subjectId,
            },
          },
        }),
    );

    const result = await paceRebuildJobFor(
      fixture.boundarySite,
      fixture.decoySite,
    ).run({ batchSize: 10 });

    expect(result).toEqual({
      tenants: 2,
      batches: 2,
      scanned: 3,
      rebuilt: 2,
      skippedUnrebuildable: 0,
      skippedFactHistory: 1,
    });
    const [boundaryState, decoyState] = await Promise.all([
      withPaceRebuildTenantContext(
        fixture.boundarySite.tenantId,
        fixture.orgId,
        async (tx) => ({
          facts: await tx.paceAssessment.count({
            where: { tenantId: fixture.boundarySite.tenantId },
          }),
          exact: await tx.paceProgress.findUniqueOrThrow({
            where: {
              tenantId_childId_subjectId: {
                tenantId: fixture.boundarySite.tenantId,
                childId: fixture.exact.childId,
                subjectId: fixture.exact.subjectId,
              },
            },
          }),
          oversized: await tx.paceProgress.findUniqueOrThrow({
            where: {
              tenantId_childId_subjectId: {
                tenantId: fixture.boundarySite.tenantId,
                childId: fixture.oversized.childId,
                subjectId: fixture.oversized.subjectId,
              },
            },
          }),
        }),
      ),
      withPaceRebuildTenantContext(
        fixture.decoySite.tenantId,
        fixture.orgId,
        async (tx) => ({
          facts: await tx.paceAssessment.count({
            where: { tenantId: fixture.decoySite.tenantId },
          }),
          progress: await tx.paceProgress.findUniqueOrThrow({
            where: {
              tenantId_childId_subjectId: {
                tenantId: fixture.decoySite.tenantId,
                childId: fixture.decoy.childId,
                subjectId: fixture.decoy.subjectId,
              },
            },
          }),
        }),
      ),
    ]);
    expect([boundaryState.facts, decoyState.facts]).toEqual(before);
    expect(boundaryState.exact).toMatchObject({
      tenantId: fixture.boundarySite.tenantId,
      currentPace: 1,
      completedPaces: 0,
    });
    expect(boundaryState.oversized).toEqual(oversizedBefore);
    expect(decoyState.progress).toMatchObject({
      tenantId: fixture.decoySite.tenantId,
      currentPace: 101,
      completedPaces: 0,
    });
    const crossSiteRows = await withPaceRebuildTenantContext(
      fixture.boundarySite.tenantId,
      fixture.orgId,
      (tx) =>
        tx.paceProgress.count({
          where: { tenantId: fixture.decoySite.tenantId },
        }),
    );
    expect(crossSiteRows).toBe(0);
  });

  it("serializes an O09 record ahead of the worker and rebuilds the committed terminal fact", async () => {
    if (!isDatabaseAvailable()) return;
    const site = fixture.recordSite;
    const enrollment = fixture.record;
    const lock = await holdPaceLock(site.tenantId, enrollment.childId);
    const service = new PaceCommandService(new OutboxService());
    const beforeFacts = await withPaceRebuildTenantContext(
      site.tenantId,
      site.orgId,
      (tx) => tx.paceAssessment.count({ where: { tenantId: site.tenantId } }),
    );
    const record = service.record(
      {
        idempotencyKey: randomUUID(),
        childId: enrollment.childId,
        subjectId: enrollment.subjectId,
        paceNumber: enrollment.startingPace,
        assessmentType: "FinalTest",
        score: 90,
        assessedAt: "2026-08-06T12:00:00.000Z",
        reason: "Record while projection rebuild is queued",
      },
      { tenantId: site.tenantId, orgId: site.orgId, userId: site.actorId },
    );
    await waitForWaitingPaceLocks(
      lockObserver,
      site.tenantId,
      enrollment.childId,
      1,
    );
    const rebuild = paceRebuildJobFor(site).run({ batchSize: 10 });
    await waitForWaitingPaceLocks(
      lockObserver,
      site.tenantId,
      enrollment.childId,
      2,
    );
    await lock.release();

    const [recorded, rebuilt] = await Promise.all([record, rebuild]);
    const state = await withPaceRebuildTenantContext(
      site.tenantId,
      site.orgId,
      async (tx) => ({
        facts: await tx.paceAssessment.count({
          where: { tenantId: site.tenantId },
        }),
        progress: await tx.paceProgress.findUniqueOrThrow({
          where: {
            tenantId_childId_subjectId: {
              tenantId: site.tenantId,
              childId: enrollment.childId,
              subjectId: enrollment.subjectId,
            },
          },
        }),
      }),
    );
    expect(rebuilt).toMatchObject({ rebuilt: 1, skippedUnrebuildable: 0 });
    expect(state.facts).toBe(beforeFacts + 1);
    expect(state.progress).toMatchObject({
      currentPace: 1002,
      completedPaces: 1,
      blockCode: null,
      lastAssessmentId: recorded.assessment.id,
    });
  });

  it("serializes an O10 correction ahead of the worker and folds only terminal facts", async () => {
    if (!isDatabaseAvailable()) return;
    const site = fixture.correctionSite;
    const enrollment = fixture.correction;
    const lock = await holdPaceLock(site.tenantId, enrollment.childId);
    const service = new PaceCommandService(new OutboxService());
    const beforeFacts = await withPaceRebuildTenantContext(
      site.tenantId,
      site.orgId,
      (tx) => tx.paceAssessment.count({ where: { tenantId: site.tenantId } }),
    );
    const correction = service.correct(
      enrollment.originalAssessmentId,
      {
        childId: enrollment.childId,
        subjectId: enrollment.subjectId,
        paceNumber: enrollment.startingPace,
        assessmentType: "FinalTest",
        score: 90,
        assessedAt: "2026-08-07T12:00:00.000Z",
        reason: "Correct while projection rebuild is queued",
      },
      { tenantId: site.tenantId, orgId: site.orgId, userId: site.actorId },
    );
    await waitForWaitingPaceLocks(
      lockObserver,
      site.tenantId,
      enrollment.childId,
      1,
    );
    const rebuild = paceRebuildJobFor(site).run({ batchSize: 10 });
    await waitForWaitingPaceLocks(
      lockObserver,
      site.tenantId,
      enrollment.childId,
      2,
    );
    await lock.release();

    const [corrected, rebuilt] = await Promise.all([correction, rebuild]);
    const state = await withPaceRebuildTenantContext(
      site.tenantId,
      site.orgId,
      async (tx) => ({
        facts: await tx.paceAssessment.count({
          where: { tenantId: site.tenantId },
        }),
        original: await tx.paceAssessment.findUniqueOrThrow({
          where: { id: enrollment.originalAssessmentId },
        }),
        correction: await tx.paceAssessment.findUniqueOrThrow({
          where: { id: corrected.assessment.id },
        }),
        progress: await tx.paceProgress.findUniqueOrThrow({
          where: {
            tenantId_childId_subjectId: {
              tenantId: site.tenantId,
              childId: enrollment.childId,
              subjectId: enrollment.subjectId,
            },
          },
        }),
      }),
    );
    expect(rebuilt).toMatchObject({ rebuilt: 1, skippedUnrebuildable: 0 });
    expect(state.facts).toBe(beforeFacts + 1);
    expect(state.original).toMatchObject({ result: "FAILED" });
    expect(state.correction).toMatchObject({
      result: "PASSED",
      correctsAssessmentId: enrollment.originalAssessmentId,
    });
    expect(state.progress).toMatchObject({
      currentPace: 1102,
      completedPaces: 1,
      blockCode: null,
      lastAssessmentId: corrected.assessment.id,
    });
  });
});
