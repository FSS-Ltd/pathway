import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  RebuildPaceProgressJob,
  type PaceProgressRebuildTransaction,
} from "../../../../workers/src/pace/rebuild-pace-progress.job";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import { PaceCommandService } from "../pace-command.service";
import { StudentSubjectsService } from "../student-subjects.service";

describe("ACE subject placement progress baseline", () => {
  const orgId = randomUUID();
  const tenantId = randomUUID();
  const otherSiteId = randomUUID();
  const userId = randomUUID();
  const childId = randomUUID();
  const subjectId = randomUUID();
  const oldEnrollmentId = randomUUID();
  const oldAssessmentId = randomUUID();
  const actor = { orgId, tenantId, userId };
  const revision = {
    subjectId,
    replacesEnrollmentId: oldEnrollmentId,
    startsOn: "2026-08-10",
    startingPace: 1003,
    currentPace: 1003,
    targetPace: 1005,
    reason: "Revised after diagnostic review",
  };

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Subject placement test",
        slug: `subject-placement-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: tenantId,
          orgId,
          name: "Subject placement site",
          slug: `subject-placement-${tenantId}`,
          timezone: "Etc/UTC",
        },
        {
          id: otherSiteId,
          orgId,
          name: "Other site",
          slug: `subject-placement-${otherSiteId}`,
          timezone: "Etc/UTC",
        },
      ],
    });
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.user.create({
        data: { id: userId, email: `${userId}@example.test`, tenantId },
      });
      await tx.siteMembership.create({ data: { tenantId, userId } });
      await tx.child.create({
        data: { id: childId, tenantId, firstName: "Test", lastName: "Child" },
      });
      await tx.subject.create({
        data: { id: subjectId, tenantId, name: "Mathematics" },
      });
      await tx.studentSubjectEnrollment.create({
        data: {
          id: oldEnrollmentId,
          tenantId,
          childId,
          subjectId,
          startsOn: new Date("2026-08-01T12:00:00.000Z"),
          startingPace: 1001,
          currentPace: 1001,
          targetPace: 1003,
          recordedByUserId: userId,
          reason: "Initial placement",
        },
      });
      await tx.paceAssessment.create({
        data: {
          id: oldAssessmentId,
          tenantId,
          childId,
          subjectId,
          paceNumber: 1001,
          assessmentType: "PACE_TEST",
          score: 90,
          result: "PASSED",
          assessedOn: new Date("2026-08-05T12:00:00.000Z"),
          recordedByUserId: userId,
          reason: "Completed before placement revision",
        },
      });
      await tx.paceProgress.create({
        data: {
          tenantId,
          childId,
          subjectId,
          currentPace: 1002,
          targetPace: 1003,
          completedPaces: 1,
          trackStatus: "BEHIND",
          lastAssessmentId: oldAssessmentId,
          rebuiltAt: new Date("2026-08-05T12:00:00.000Z"),
        },
      });
      await tx.pacePolicy.create({
        data: {
          tenantId,
          version: 1,
          selfTestPassingScore: 80,
          paceTestPassingScore: 80,
          maxAssessmentsPerDay: 3,
          allowSamePaceSameDay: true,
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          createdByUserId: userId,
          reason: "Subject placement test policy",
        },
      });
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await prisma.outboxEvent.deleteMany({ where: { orgId } });
    await prisma.auditEvent.deleteMany({ where: { tenantId } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PaceProgress", "PaceAssessment", "PacePolicy" CASCADE',
    );
    await prisma.studentSubjectEnrollment.deleteMany({ where: { tenantId } });
    await prisma.subject.deleteMany({ where: { tenantId } });
    await prisma.child.deleteMany({ where: { tenantId } });
    await prisma.siteMembership.deleteMany({ where: { tenantId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [tenantId, otherSiteId] } },
    });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("keeps the revision atomic, site-scoped and based on its own assessment history", async () => {
    if (!isDatabaseAvailable()) return;
    const service = new StudentSubjectsService(new OutboxService());
    await expect(
      service.place(childId, revision, { ...actor, tenantId: otherSiteId }),
    ).rejects.toThrow("Child not found");

    const failingOutbox = new OutboxService();
    jest
      .spyOn(failingOutbox, "enqueue")
      .mockRejectedValueOnce(new Error("outbox failed"));
    await expect(
      new StudentSubjectsService(failingOutbox).place(childId, revision, actor),
    ).rejects.toThrow("outbox failed");
    const unchanged = await withTenantRlsContext(
      tenantId,
      orgId,
      async (tx) => ({
        active: await tx.studentSubjectEnrollment.count({
          where: { tenantId, childId, subjectId, status: "ACTIVE" },
        }),
        progress: await tx.paceProgress.findFirst({
          where: { tenantId, childId, subjectId },
        }),
      }),
    );
    expect(unchanged.active).toBe(1);
    expect(unchanged.progress?.currentPace).toBe(1002);

    const placement = await service.place(childId, revision, actor);
    const revised = await withTenantRlsContext(tenantId, orgId, async (tx) => ({
      old: await tx.studentSubjectEnrollment.findUnique({
        where: { id: oldEnrollmentId },
      }),
      progress: await tx.paceProgress.findFirst({
        where: { tenantId, childId, subjectId },
      }),
      audit: await tx.auditEvent.findMany({
        where: { entityId: placement.id },
      }),
    }));
    expect(revised.old?.status).toBe("ENDED");
    expect(revised.progress).toMatchObject({
      currentPace: 1003,
      targetPace: 1005,
      completedPaces: 0,
      lastAssessmentId: null,
      blockCode: null,
    });
    expect(revised.audit).toHaveLength(1);

    await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.paceAssessment.create({
        data: {
          tenantId,
          childId,
          subjectId,
          paceNumber: 1003,
          assessmentType: "SELF_TEST",
          score: 90,
          result: "PASSED",
          assessedOn: new Date("2026-08-11T12:00:00.000Z"),
          recordedByUserId: userId,
          reason: "Required new placement Self Test",
        },
      }),
    );
    const recorded = await new PaceCommandService(new OutboxService()).record(
      {
        idempotencyKey: randomUUID(),
        childId,
        subjectId,
        paceNumber: 1003,
        assessmentType: "FinalTest",
        score: 90,
        assessedAt: "2026-08-12T13:00:00.000Z",
        reason: "Completed after placement revision",
      },
      actor,
    );
    expect(recorded.progress).toMatchObject({
      currentPace: 1004,
      targetPace: 1005,
      completedPaces: 1,
      lastAssessmentId: recorded.assessment.id,
    });

    const rebuild = new RebuildPaceProgressJob(
      {
        tenant: { findMany: async () => [{ id: tenantId, orgId }] },
      },
      (siteId, organisationId, callback) =>
        withTenantRlsContext(siteId, organisationId, (tx) =>
          callback(tx as unknown as PaceProgressRebuildTransaction),
        ),
    );
    await expect(rebuild.run({ batchSize: 1 })).resolves.toMatchObject({
      rebuilt: 1,
    });
    const rebuilt = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.paceProgress.findFirst({ where: { tenantId, childId, subjectId } }),
    );
    expect(rebuilt).toMatchObject({
      currentPace: 1004,
      completedPaces: 1,
      lastAssessmentId: recorded.assessment.id,
    });
  });
});
