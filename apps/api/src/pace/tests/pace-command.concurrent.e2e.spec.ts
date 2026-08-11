import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import { isDatabaseAvailable, requireDatabase } from "../../../test-helpers.e2e";
import { PaceCommandService } from "../pace-command.service";

interface Fixture {
  orgId: string;
  tenantId: string;
  actorId: string;
  childId: string;
  subjectId: string;
}

describe("PACE assessment command database transaction and concurrency", () => {
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    fixture = {
      orgId: randomUUID(),
      tenantId: randomUUID(),
      actorId: randomUUID(),
      childId: randomUUID(),
      subjectId: randomUUID(),
    };
    await prisma.org.create({
      data: {
        id: fixture.orgId,
        name: `PACE command org ${fixture.orgId}`,
        slug: `pace-command-${fixture.orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.create({
      data: {
        id: fixture.tenantId,
        orgId: fixture.orgId,
        name: `PACE command site ${fixture.tenantId}`,
        slug: `pace-command-${fixture.tenantId}`,
        timezone: "Pacific/Auckland",
      },
    });
    await withTenantRlsContext(fixture.tenantId, fixture.orgId, async (tx) => {
      await tx.user.create({
        data: {
          id: fixture!.actorId,
          tenantId: fixture!.tenantId,
          email: `${fixture!.actorId}@example.test`,
        },
      });
      await tx.siteMembership.create({
        data: { tenantId: fixture!.tenantId, userId: fixture!.actorId },
      });
      await tx.child.create({
        data: {
          id: fixture!.childId,
          tenantId: fixture!.tenantId,
          firstName: "Concurrency",
          lastName: "Learner",
        },
      });
      await tx.subject.create({
        data: {
          id: fixture!.subjectId,
          tenantId: fixture!.tenantId,
          name: `Mathematics ${fixture!.subjectId}`,
        },
      });
      await tx.studentSubjectEnrollment.create({
        data: {
          tenantId: fixture!.tenantId,
          childId: fixture!.childId,
          subjectId: fixture!.subjectId,
          startsOn: new Date("2026-08-01T12:00:00.000Z"),
          startingPace: 1001,
          currentPace: 1001,
          targetPace: 1002,
          recordedByUserId: fixture!.actorId,
          reason: "PACE concurrency fixture",
        },
      });
      await tx.pacePolicy.create({
        data: {
          tenantId: fixture!.tenantId,
          version: 1,
          selfTestPassingScore: 80,
          paceTestPassingScore: 80,
          maxAssessmentsPerDay: 5,
          allowSamePaceSameDay: true,
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          createdByUserId: fixture!.actorId,
          reason: "PACE concurrency policy",
        },
      });
      await tx.paceAssessment.create({
        data: {
          tenantId: fixture!.tenantId,
          childId: fixture!.childId,
          subjectId: fixture!.subjectId,
          paceNumber: 1001,
          assessmentType: "SELF_TEST",
          score: 90,
          result: "PASSED",
          assessedOn: new Date("2026-08-10T12:00:00.000Z"),
          recordedByUserId: fixture!.actorId,
          reason: "Required Self Test fixture",
        },
      });
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await prisma.outboxEvent.deleteMany({ where: { orgId: fixture.orgId } });
    await prisma.auditEvent.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PaceProgress", "PaceAssessment", "PacePolicy" CASCADE',
    );
    await prisma.studentSubjectEnrollment.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.subject.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.child.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.siteMembership.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.user.deleteMany({ where: { id: fixture.actorId } });
    await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
    await prisma.org.deleteMany({ where: { id: fixture.orgId } });
  });

  it("commits exactly one fact and one projection outcome for concurrent duplicate commands", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new PaceCommandService(new OutboxService());
    const actor = {
      tenantId: fixture.tenantId,
      orgId: fixture.orgId,
      userId: fixture.actorId,
    };
    const command = {
      idempotencyKey: randomUUID(),
      childId: fixture.childId,
      subjectId: fixture.subjectId,
      paceNumber: 1001,
      assessmentType: "FinalTest" as const,
      score: 90,
      assessedAt: "2026-08-11T11:30:00.000Z",
      reason: "Concurrent PACE command",
    };

    const results = await Promise.all([
      service.record(command, actor),
      service.record(command, actor),
    ]);
    expect(new Set(results.map((result) => result.assessment.id)).size).toBe(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);

    const counts = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      async (tx) => ({
        facts: await tx.paceAssessment.count({
          where: { tenantId: fixture!.tenantId, assessmentType: "PACE_TEST" },
        }),
        projections: await tx.paceProgress.count({
          where: {
            tenantId: fixture!.tenantId,
            childId: fixture!.childId,
            subjectId: fixture!.subjectId,
          },
        }),
        audits: await tx.auditEvent.count({
          where: { tenantId: fixture!.tenantId, entityType: "ACE_RECORD" },
        }),
        intents: await tx.outboxEvent.count({
          where: { aggregateType: "PACE_ASSESSMENT" },
        }),
      }),
    );
    expect(counts).toEqual({ facts: 1, projections: 1, audits: 1, intents: 1 });
  });

  it("rolls back fact, projection, audit, and intent when outbox enqueue fails", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const failureId = randomUUID();
    const service = new PaceCommandService({
      enqueue: async () => {
        throw new Error("forced transactional outbox failure");
      },
    } as OutboxService);

    await expect(
      service.record(
        {
          idempotencyKey: failureId,
          childId: fixture.childId,
          subjectId: fixture.subjectId,
          paceNumber: 1002,
          assessmentType: "SelfTest",
          score: 90,
          assessedAt: "2026-08-12T11:30:00.000Z",
          reason: "Rollback PACE command",
        },
        {
          tenantId: fixture.tenantId,
          orgId: fixture.orgId,
          userId: fixture.actorId,
        },
      ),
    ).rejects.toThrow("forced transactional outbox failure");

    const rows = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      async (tx) => ({
        fact: await tx.paceAssessment.findFirst({
          where: { tenantId: fixture!.tenantId, paceNumber: 1002 },
          select: { id: true },
        }),
        progress: await tx.paceProgress.findUnique({
          where: {
            tenantId_childId_subjectId: {
              tenantId: fixture!.tenantId,
              childId: fixture!.childId,
              subjectId: fixture!.subjectId,
            },
          },
          select: { currentPace: true, lastAssessmentId: true },
        }),
        auditCount: await tx.auditEvent.count({
          where: { tenantId: fixture!.tenantId, entityType: "ACE_RECORD" },
        }),
        intent: await tx.outboxEvent.findFirst({
          where: { idempotencyKey: `ace-pace-assessment:${fixture!.tenantId}:${failureId}` },
          select: { id: true },
        }),
      }),
    );
    expect(rows.fact).toBeNull();
    expect(rows.progress).toMatchObject({
      currentPace: 1002,
      lastAssessmentId: expect.any(String),
    });
    expect(rows.auditCount).toBe(1);
    expect(rows.intent).toBeNull();
  });
});
