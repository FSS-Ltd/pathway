import { randomUUID } from "node:crypto";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";
import {
  RebuildPaceProgressJob,
  type PaceProgressRebuildTransaction,
} from "../../../../workers/src/pace/rebuild-pace-progress.job";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

export interface SiteFixture {
  orgId: string;
  tenantId: string;
  actorId: string;
}

export interface EnrollmentFixture {
  childId: string;
  subjectId: string;
  enrollmentId: string;
  startingPace: number;
  targetPace: number;
}

export interface PaceRebuildFixture {
  orgId: string;
  boundarySite: SiteFixture;
  decoySite: SiteFixture;
  recordSite: SiteFixture;
  correctionSite: SiteFixture;
  exact: EnrollmentFixture;
  oversized: EnrollmentFixture;
  decoy: EnrollmentFixture;
  record: EnrollmentFixture;
  correction: EnrollmentFixture & { originalAssessmentId: string };
}

function makeSite(orgId: string): SiteFixture {
  return { orgId, tenantId: randomUUID(), actorId: randomUUID() };
}

function makeEnrollment(
  startingPace: number,
  targetPace: number,
): EnrollmentFixture {
  return {
    childId: randomUUID(),
    subjectId: randomUUID(),
    enrollmentId: randomUUID(),
    startingPace,
    targetPace,
  };
}

export function createPaceRebuildFixture(): PaceRebuildFixture {
  const orgId = randomUUID();
  return {
    orgId,
    boundarySite: makeSite(orgId),
    decoySite: makeSite(orgId),
    recordSite: makeSite(orgId),
    correctionSite: makeSite(orgId),
    exact: makeEnrollment(1, 3),
    oversized: makeEnrollment(1, 3),
    decoy: makeEnrollment(101, 102),
    record: makeEnrollment(1001, 1003),
    correction: {
      ...makeEnrollment(1101, 1103),
      originalAssessmentId: randomUUID(),
    },
  };
}

export async function withPaceRebuildTenantContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    return callback(tx);
  });
}

export function paceRebuildJobFor(
  ...sites: SiteFixture[]
): RebuildPaceProgressJob {
  return new RebuildPaceProgressJob(
    {
      tenant: {
        findMany: async () =>
          sites.map(({ tenantId: id, orgId }) => ({ id, orgId })),
      },
    },
    (tenantId, orgId, callback) =>
      withPaceRebuildTenantContext(tenantId, orgId, (tx) =>
        callback(tx as unknown as PaceProgressRebuildTransaction),
      ),
  );
}

function assessmentRows(
  site: SiteFixture,
  enrollment: EnrollmentFixture,
  count: number,
): Prisma.PaceAssessmentCreateManyInput[] {
  return Array.from({ length: count }, (_, index) => ({
    id: randomUUID(),
    tenantId: site.tenantId,
    childId: enrollment.childId,
    subjectId: enrollment.subjectId,
    paceNumber: enrollment.startingPace,
    assessmentType: "SELF_TEST",
    score: 70,
    result: "FAILED",
    assessedOn: new Date("2026-08-01T12:00:00.000Z"),
    recordedByUserId: site.actorId,
    reason: `PACE rebuild history ${index}`,
  }));
}

async function seedSite(site: SiteFixture): Promise<void> {
  await prisma.tenant.create({
    data: {
      id: site.tenantId,
      orgId: site.orgId,
      name: `PACE rebuild site ${site.tenantId}`,
      slug: `pace-rebuild-${site.tenantId}`,
      timezone: "Europe/London",
    },
  });
  await withTenantRlsContext(site.tenantId, site.orgId, async (tx) => {
    await tx.user.create({
      data: {
        id: site.actorId,
        tenantId: site.tenantId,
        email: `${site.actorId}@example.test`,
      },
    });
    await tx.siteMembership.create({
      data: { tenantId: site.tenantId, userId: site.actorId },
    });
    await tx.pacePolicy.create({
      data: {
        tenantId: site.tenantId,
        version: 1,
        selfTestPassingScore: 80,
        paceTestPassingScore: 80,
        maxAssessmentsPerDay: 2_000,
        allowSamePaceSameDay: true,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: site.actorId,
        reason: "PACE rebuild integration policy",
      },
    });
  });
}

async function seedEnrollment(
  site: SiteFixture,
  enrollment: EnrollmentFixture,
): Promise<void> {
  await withTenantRlsContext(site.tenantId, site.orgId, async (tx) => {
    await tx.child.create({
      data: {
        id: enrollment.childId,
        tenantId: site.tenantId,
        firstName: "PACE",
        lastName: "Rebuild",
      },
    });
    await tx.subject.create({
      data: {
        id: enrollment.subjectId,
        tenantId: site.tenantId,
        name: `PACE subject ${enrollment.subjectId}`,
      },
    });
    await tx.studentSubjectEnrollment.create({
      data: {
        id: enrollment.enrollmentId,
        tenantId: site.tenantId,
        childId: enrollment.childId,
        subjectId: enrollment.subjectId,
        startsOn: new Date("2026-01-01T12:00:00.000Z"),
        startingPace: enrollment.startingPace,
        currentPace: enrollment.startingPace,
        targetPace: enrollment.targetPace,
        recordedByUserId: site.actorId,
        reason: "PACE rebuild integration placement",
      },
    });
  });
}

export async function seedPaceRebuildFixture(
  fixture: PaceRebuildFixture,
): Promise<void> {
  await prisma.org.create({
    data: {
      id: fixture.orgId,
      name: `PACE rebuild org ${fixture.orgId}`,
      slug: `pace-rebuild-${fixture.orgId}`,
      planCode: "trial",
    },
  });
  for (const site of [
    fixture.boundarySite,
    fixture.decoySite,
    fixture.recordSite,
    fixture.correctionSite,
  ]) {
    await seedSite(site);
  }
  for (const [site, enrollment] of [
    [fixture.boundarySite, fixture.exact],
    [fixture.boundarySite, fixture.oversized],
    [fixture.decoySite, fixture.decoy],
    [fixture.recordSite, fixture.record],
    [fixture.correctionSite, fixture.correction],
  ] as const) {
    await seedEnrollment(site, enrollment);
  }

  await withTenantRlsContext(
    fixture.boundarySite.tenantId,
    fixture.orgId,
    async (tx) => {
      await tx.paceAssessment.createMany({
        data: [
          ...assessmentRows(fixture.boundarySite, fixture.exact, 500),
          ...assessmentRows(fixture.boundarySite, fixture.oversized, 501),
        ],
      });
      await tx.paceProgress.createMany({
        data: [fixture.exact, fixture.oversized].map((enrollment) => ({
          tenantId: fixture.boundarySite.tenantId,
          childId: enrollment.childId,
          subjectId: enrollment.subjectId,
          currentPace: 2,
          targetPace: enrollment.targetPace,
          completedPaces: 9,
          trackStatus: "BEHIND" as const,
          rebuiltAt: new Date("2026-08-02T00:00:00.000Z"),
        })),
      });
    },
  );

  await withTenantRlsContext(
    fixture.recordSite.tenantId,
    fixture.orgId,
    (tx) =>
      tx.paceAssessment.create({
        data: {
          tenantId: fixture.recordSite.tenantId,
          childId: fixture.record.childId,
          subjectId: fixture.record.subjectId,
          paceNumber: fixture.record.startingPace,
          assessmentType: "SELF_TEST",
          score: 90,
          result: "PASSED",
          assessedOn: new Date("2026-08-03T12:00:00.000Z"),
          recordedByUserId: fixture.recordSite.actorId,
          reason: "Required record-race Self Test",
        },
      }),
  );

  await withTenantRlsContext(
    fixture.correctionSite.tenantId,
    fixture.orgId,
    async (tx) => {
      await tx.paceAssessment.createMany({
        data: [
          {
            tenantId: fixture.correctionSite.tenantId,
            childId: fixture.correction.childId,
            subjectId: fixture.correction.subjectId,
            paceNumber: fixture.correction.startingPace,
            assessmentType: "SELF_TEST",
            score: 90,
            result: "PASSED",
            assessedOn: new Date("2026-08-04T12:00:00.000Z"),
            recordedByUserId: fixture.correctionSite.actorId,
            reason: "Required correction-race Self Test",
          },
          {
            id: fixture.correction.originalAssessmentId,
            tenantId: fixture.correctionSite.tenantId,
            childId: fixture.correction.childId,
            subjectId: fixture.correction.subjectId,
            paceNumber: fixture.correction.startingPace,
            assessmentType: "PACE_TEST",
            score: 70,
            result: "FAILED",
            assessedOn: new Date("2026-08-05T12:00:00.000Z"),
            recordedByUserId: fixture.correctionSite.actorId,
            reason: "Original failed Final Test",
          },
        ],
      });
      await tx.paceProgress.create({
        data: {
          tenantId: fixture.correctionSite.tenantId,
          childId: fixture.correction.childId,
          subjectId: fixture.correction.subjectId,
          currentPace: fixture.correction.startingPace,
          targetPace: fixture.correction.targetPace,
          completedPaces: 0,
          trackStatus: "BEHIND",
          blockCode: "score-below-threshold",
          lastAssessmentId: fixture.correction.originalAssessmentId,
          rebuiltAt: new Date("2026-08-05T13:00:00.000Z"),
        },
      });
    },
  );
}
