import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import { OutboxService } from "../../common/outbox/outbox.service";
import { PaceCommandService } from "../pace-command.service";

interface Fixture {
  orgId: string;
  tenantId: string;
  actorId: string;
  childId: string;
  subjectId: string;
  originalFinalId: string;
}

describe("PACE correction transaction and assessment-command concurrency", () => {
  let fixture: Fixture | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    const orgId = randomUUID();
    const tenantId = randomUUID();
    const actorId = randomUUID();
    const childId = randomUUID();
    const subjectId = randomUUID();
    const originalFinalId = randomUUID();
    fixture = {
      orgId,
      tenantId,
      actorId,
      childId,
      subjectId,
      originalFinalId,
    };

    await prisma.org.create({
      data: {
        id: orgId,
        name: `PACE correction org ${orgId}`,
        slug: `pace-correction-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: `PACE correction site ${tenantId}`,
        slug: `pace-correction-${tenantId}`,
        timezone: "Europe/London",
      },
    });
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.user.create({
        data: {
          id: actorId,
          tenantId,
          email: `${actorId}@example.test`,
        },
      });
      await tx.siteMembership.create({
        data: { tenantId, userId: actorId },
      });
      await tx.child.create({
        data: {
          id: childId,
          tenantId,
          firstName: "Correction",
          lastName: "Learner",
        },
      });
      await tx.subject.create({
        data: { id: subjectId, tenantId, name: `Mathematics ${subjectId}` },
      });
      await tx.studentSubjectEnrollment.create({
        data: {
          tenantId,
          childId,
          subjectId,
          startsOn: new Date("2026-08-01T12:00:00.000Z"),
          startingPace: 1001,
          currentPace: 1001,
          targetPace: 1003,
          recordedByUserId: actorId,
          reason: "PACE correction concurrency fixture",
        },
      });
      await tx.pacePolicy.create({
        data: {
          tenantId,
          version: 1,
          selfTestPassingScore: 80,
          paceTestPassingScore: 80,
          maxAssessmentsPerDay: 5,
          allowSamePaceSameDay: true,
          effectiveFrom: new Date("2026-08-01T00:00:00.000Z"),
          createdByUserId: actorId,
          reason: "PACE correction concurrency policy",
        },
      });
      await tx.paceAssessment.create({
        data: {
          tenantId,
          childId,
          subjectId,
          paceNumber: 1001,
          assessmentType: "SELF_TEST",
          score: 90,
          result: "PASSED",
          assessedOn: new Date("2026-08-09T12:00:00.000Z"),
          recordedByUserId: actorId,
          reason: "Required Self Test fixture",
        },
      });
      await tx.paceAssessment.create({
        data: {
          id: originalFinalId,
          tenantId,
          childId,
          subjectId,
          paceNumber: 1001,
          assessmentType: "PACE_TEST",
          score: 90,
          result: "PASSED",
          assessedOn: new Date("2026-08-10T12:00:00.000Z"),
          recordedByUserId: actorId,
          reason: "Original Final Test fixture",
        },
      });
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await prisma.outboxEvent.deleteMany({ where: { orgId: fixture.orgId } });
    await prisma.auditEvent.deleteMany({
      where: { tenantId: fixture.tenantId },
    });
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "PaceProgress", "PaceAssessment", "PacePolicy" CASCADE',
    );
    await prisma.studentSubjectEnrollment.deleteMany({
      where: { tenantId: fixture.tenantId },
    });
    await prisma.subject.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.child.deleteMany({ where: { tenantId: fixture.tenantId } });
    await prisma.siteMembership.deleteMany({
      where: { tenantId: fixture.tenantId },
    });
    await prisma.user.deleteMany({ where: { id: fixture.actorId } });
    await prisma.tenant.deleteMany({ where: { id: fixture.tenantId } });
    await prisma.org.deleteMany({ where: { id: fixture.orgId } });
  });

  it("serializes correction and recording before fact and projection reads", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new PaceCommandService(new OutboxService());
    const actor = {
      tenantId: fixture.tenantId,
      orgId: fixture.orgId,
      userId: fixture.actorId,
    };

    await Promise.all([
      service.correct(
        fixture.originalFinalId,
        {
          childId: fixture.childId,
          subjectId: fixture.subjectId,
          paceNumber: 1001,
          assessmentType: "FinalTest",
          score: 70,
          assessedAt: "2026-08-12T11:00:00.000Z",
          reason: "Correct the original Final Test score",
        },
        actor,
      ),
      service.record(
        {
          idempotencyKey: randomUUID(),
          childId: fixture.childId,
          subjectId: fixture.subjectId,
          paceNumber: 1002,
          assessmentType: "SelfTest",
          score: 90,
          assessedAt: "2026-08-13T11:00:00.000Z",
          reason: "Concurrent next PACE Self Test",
        },
        actor,
      ),
    ]);

    const state = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      async (tx) => ({
        original: await tx.paceAssessment.findUnique({
          where: { id: fixture!.originalFinalId },
          select: { score: true, result: true },
        }),
        correction: await tx.paceAssessment.findFirst({
          where: {
            tenantId: fixture!.tenantId,
            correctsAssessmentId: fixture!.originalFinalId,
          },
          select: { id: true, score: true, result: true },
        }),
        progress: await tx.paceProgress.findUnique({
          where: {
            tenantId_childId_subjectId: {
              tenantId: fixture!.tenantId,
              childId: fixture!.childId,
              subjectId: fixture!.subjectId,
            },
          },
          select: {
            currentPace: true,
            completedPaces: true,
            lastAssessmentId: true,
          },
        }),
        auditCount: await tx.auditEvent.count({
          where: { tenantId: fixture!.tenantId, entityType: "ACE_RECORD" },
        }),
        intentCount: await tx.outboxEvent.count({
          where: {
            aggregateType: { in: ["PACE_ASSESSMENT"] },
          },
        }),
      }),
    );
    expect(state.original).toEqual({ score: 90, result: "PASSED" });
    expect(state.correction).toMatchObject({ score: 70, result: "FAILED" });
    expect(state.progress).toMatchObject({
      currentPace: 1001,
      completedPaces: 0,
    });
    expect(state.auditCount).toBe(2);
    expect(state.intentCount).toBe(2);
  });

  it("persists and consumes one explicit scoped override", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new PaceCommandService(new OutboxService());
    const now = new Date();
    const actor = {
      tenantId: fixture.tenantId,
      orgId: fixture.orgId,
      userId: fixture.actorId,
      stepUp: {
        authenticatedAt: now.toISOString(),
        secondFactor: true as const,
      },
    };
    const policyOverride = await service.override(
      {
        childId: fixture.childId,
        subjectId: fixture.subjectId,
        policyCode: "score-below-threshold",
        expiresAt: new Date(now.getTime() + 10 * 60 * 1_000).toISOString(),
        reason: "Supervised progression exception",
      },
      actor,
    );

    const result = await service.record(
      {
        idempotencyKey: randomUUID(),
        childId: fixture.childId,
        subjectId: fixture.subjectId,
        paceNumber: 1001,
        assessmentType: "FinalTest",
        score: 70,
        assessedAt: now.toISOString(),
        reason: "Assessment using authorised exception",
        policyOverrideId: policyOverride.id,
      },
      actor,
    );
    expect(result.policy).toMatchObject({ decision: "allow", code: "allowed" });

    const state = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      async (tx) => ({
        assessment: await tx.paceAssessment.findFirst({
          where: {
            tenantId: fixture!.tenantId,
            policyOverrideId: policyOverride.id,
          },
          select: { score: true, result: true, policyOverrideId: true },
        }),
        progress: await tx.paceProgress.findUnique({
          where: {
            tenantId_childId_subjectId: {
              tenantId: fixture!.tenantId,
              childId: fixture!.childId,
              subjectId: fixture!.subjectId,
            },
          },
          select: { currentPace: true, completedPaces: true },
        }),
      }),
    );
    expect(state.assessment).toEqual({
      score: 70,
      result: "FAILED",
      policyOverrideId: policyOverride.id,
    });
    expect(state.progress).toEqual({ currentPace: 1002, completedPaces: 1 });
  });

  it("rolls correction fact, projection, audit, and intent back together", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new PaceCommandService({
      enqueue: async () => {
        throw new Error("forced correction outbox failure");
      },
    } as OutboxService);
    const before = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      async (tx) => ({
        facts: await tx.paceAssessment.count({
          where: { tenantId: fixture!.tenantId },
        }),
        audits: await tx.auditEvent.count({
          where: { tenantId: fixture!.tenantId },
        }),
        intents: await tx.outboxEvent.count({
          where: { aggregateType: "PACE_ASSESSMENT" },
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
      }),
    );
    const selfTest = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      (tx) =>
        tx.paceAssessment.findFirstOrThrow({
          where: {
            tenantId: fixture!.tenantId,
            paceNumber: 1002,
            assessmentType: "SELF_TEST",
          },
          select: { id: true },
        }),
    );

    await expect(
      service.correct(
        selfTest.id,
        {
          childId: fixture.childId,
          subjectId: fixture.subjectId,
          paceNumber: 1002,
          assessmentType: "SelfTest",
          score: 70,
          assessedAt: "2026-08-14T11:00:00.000Z",
          reason: "Rollback correction fixture",
        },
        {
          tenantId: fixture.tenantId,
          orgId: fixture.orgId,
          userId: fixture.actorId,
        },
      ),
    ).rejects.toThrow("forced correction outbox failure");

    const after = await withTenantRlsContext(
      fixture.tenantId,
      fixture.orgId,
      async (tx) => ({
        facts: await tx.paceAssessment.count({
          where: { tenantId: fixture!.tenantId },
        }),
        audits: await tx.auditEvent.count({
          where: { tenantId: fixture!.tenantId },
        }),
        intents: await tx.outboxEvent.count({
          where: { aggregateType: "PACE_ASSESSMENT" },
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
      }),
    );
    expect(after.facts).toBe(before.facts);
    expect(after.audits).toBe(before.audits);
    expect(after.intents).toBe(before.intents);
    expect(after.progress).toEqual(before.progress);
  });
});
