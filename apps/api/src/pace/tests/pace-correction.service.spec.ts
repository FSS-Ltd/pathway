import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  paceAssessmentCorrectionSchema,
  pacePolicyOverrideSchema,
  type PaceAssessmentCorrectionDto,
  type PacePolicyOverrideDto,
} from "../dto/pace-correction.dto";
import { PaceCommandService } from "../pace-command.service";
import { PaceController } from "../pace.controller";

jest.mock("@pathway/db", () => ({
  Prisma: {
    sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({
      strings: [...strings],
      values,
    }),
  },
  withTenantRlsContext: jest.fn(),
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "user-1" };
const steppedUpActor = {
  ...actor,
  stepUp: {
    authenticatedAt: "2026-08-11T11:58:00.000Z",
    secondFactor: true as const,
  },
};

function correction(
  overrides: Partial<PaceAssessmentCorrectionDto> = {},
): PaceAssessmentCorrectionDto {
  return {
    childId: "5dce6037-f0e3-46e6-8463-2013e4251ed0",
    subjectId: "7a7450c4-54ad-407e-8388-90185ff9a5f6",
    paceNumber: 1001,
    assessmentType: "FinalTest",
    score: 70,
    assessedAt: "2026-08-11T11:30:00.000Z",
    reason: "Correcting a transcription error",
    ...overrides,
  };
}

function override(
  overrides: Partial<PacePolicyOverrideDto> = {},
): PacePolicyOverrideDto {
  return {
    childId: "5dce6037-f0e3-46e6-8463-2013e4251ed0",
    subjectId: "7a7450c4-54ad-407e-8388-90185ff9a5f6",
    policyCode: "score-below-threshold",
    expiresAt: "2026-08-11T12:10:00.000Z",
    reason: "Authorised progression after supervised review",
    ...overrides,
  };
}

function assessment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "assessment-original",
    childId: correction().childId,
    subjectId: correction().subjectId,
    paceNumber: 1001,
    assessmentType: "PACE_TEST",
    score: 90,
    result: "PASSED",
    assessedOn: new Date("2026-08-10T12:00:00.000Z"),
    correctsAssessmentId: null,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    reason: "Original transcription",
    recordedByUserId: "user-2",
    ...overrides,
  };
}

function transaction() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    tenant: { findFirst: jest.fn() },
    studentSubjectEnrollment: { findFirst: jest.fn() },
    pacePolicy: { findFirst: jest.fn() },
    pacePolicyOverride: { create: jest.fn() },
    paceAssessment: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
    },
    paceProgress: { upsert: jest.fn() },
    auditEvent: { create: jest.fn() },
    outboxEvent: {
      createMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };
}

function arrange() {
  const tx = transaction();
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  tx.tenant.findFirst.mockResolvedValue({ timezone: "Pacific/Auckland" });
  tx.studentSubjectEnrollment.findFirst.mockResolvedValue({
    startingPace: 1001,
    currentPace: 1001,
    targetPace: 1002,
  });
  tx.pacePolicy.findFirst.mockResolvedValue({
    id: "policy-1",
    selfTestPassingScore: 80,
    paceTestPassingScore: 80,
    maxAssessmentsPerDay: 2,
    allowSamePaceSameDay: true,
  });
  const original = assessment();
  const selfTest = assessment({
    id: "self-test",
    assessmentType: "SELF_TEST",
    assessedOn: new Date("2026-08-09T12:00:00.000Z"),
  });
  const successor = assessment({
    id: "assessment-correction",
    score: 70,
    result: "FAILED",
    assessedOn: new Date("2026-08-11T12:00:00.000Z"),
    correctsAssessmentId: "assessment-original",
    reason: "Correcting a transcription error",
    recordedByUserId: "user-1",
    createdAt: new Date("2026-08-11T12:00:00.000Z"),
  });
  tx.paceAssessment.findFirst.mockResolvedValue(original);
  tx.paceAssessment.findMany.mockResolvedValue([selfTest, original]);
  tx.paceAssessment.create.mockResolvedValue(successor);
  tx.paceProgress.upsert.mockResolvedValue({
    currentPace: 1001,
    targetPace: 1002,
    completedPaces: 0,
    trackStatus: "BEHIND",
    blockCode: "score-below-threshold",
    lastAssessmentId: "assessment-correction",
    rebuiltAt: new Date("2026-08-11T12:00:00.000Z"),
  });
  tx.pacePolicyOverride.create.mockResolvedValue({
    id: "override-1",
    childId: override().childId,
    subjectId: override().subjectId,
    pacePolicyId: "policy-1",
    policyCode: "score-below-threshold",
    authorisedByUserId: "user-1",
    expiresAt: new Date("2026-08-11T12:10:00.000Z"),
    createdAt: new Date("2026-08-11T12:00:00.000Z"),
  });
  tx.auditEvent.create.mockResolvedValue({});
  tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
  tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });
  return { service: new PaceCommandService(new OutboxService()), tx };
}

describe("PACE correction and override commands", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
  });

  afterEach(() => jest.useRealTimers());

  it("protects correction and override routes with separate permissions", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.correctAssessment,
      ),
    ).toBe("ace.pace.correct");
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.authorisePolicyOverride,
      ),
    ).toBe("ace.pace.override");
  });

  it("strictly validates reasons, policy codes, and bounded command fields", () => {
    expect(paceAssessmentCorrectionSchema.parse(correction())).toMatchObject({
      score: 70,
    });
    expect(pacePolicyOverrideSchema.parse(override())).toMatchObject({
      policyCode: "score-below-threshold",
    });
    expect(() =>
      paceAssessmentCorrectionSchema.parse(correction({ reason: " " })),
    ).toThrow();
    expect(() =>
      pacePolicyOverrideSchema.parse({ ...override(), policyCode: "allowed" }),
    ).toThrow();
    expect(() =>
      pacePolicyOverrideSchema.parse({ ...override(), unexpected: true }),
    ).toThrow();
  });

  it("creates a complete immutable successor under the child lock and rebuilds from terminal facts", async () => {
    const { service, tx } = arrange();

    await expect(
      service.correct("assessment-original", correction(), actor),
    ).resolves.toMatchObject({
      assessment: {
        id: "assessment-correction",
        correctsAssessmentId: "assessment-original",
      },
      progress: {
        currentPace: 1001,
        completedPaces: 0,
        lastAssessmentId: "assessment-correction",
      },
    });

    expect(tx.$executeRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: [`ace-pace-assessment:tenant-1:${correction().childId}`],
      }),
    );
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.paceAssessment.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(tx.paceAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          childId: correction().childId,
          subjectId: correction().subjectId,
          score: 70,
          result: "FAILED",
          correctsAssessmentId: "assessment-original",
          recordedByUserId: "user-1",
        }),
      }),
    );
    expect(tx.paceProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentPace: 1001,
          completedPaces: 0,
          lastAssessmentId: "assessment-correction",
        }),
      }),
    );
  });

  it("rejects a denied actor or correction outside the active child and subject scope", async () => {
    const { service, tx } = arrange();
    await expect(
      service.correct("assessment-original", correction(), {
        ...actor,
        userId: "",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(withTenantRlsContext).not.toHaveBeenCalled();

    tx.paceAssessment.findFirst.mockResolvedValue(null);
    await expect(
      service.correct("assessment-from-another-scope", correction(), actor),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(tx.paceAssessment.create).not.toHaveBeenCalled();
  });

  it("rejects stale or missing step-up and requires a future short-lived expiry", async () => {
    const { service, tx } = arrange();
    await expect(service.override(override(), actor)).rejects.toMatchObject({
      response: expect.objectContaining({ code: "STEP_UP_REQUIRED" }),
    });
    await expect(
      service.override(override(), {
        ...steppedUpActor,
        stepUp: {
          authenticatedAt: "2026-08-11T11:50:00.000Z",
          secondFactor: true,
        },
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.override(
        override({ expiresAt: "2026-08-11T12:30:00.000Z" }),
        steppedUpActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.override(
        override({ expiresAt: "2026-08-11T11:59:59.000Z" }),
        steppedUpActor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.pacePolicyOverride.create).not.toHaveBeenCalled();
  });

  it("creates an attributable scoped override with transactional audit and a content-free outbox intent", async () => {
    const { service, tx } = arrange();

    await expect(
      service.override(override(), steppedUpActor),
    ).resolves.toMatchObject({
      id: "override-1",
      childId: override().childId,
      subjectId: override().subjectId,
      policyCode: "score-below-threshold",
      authorisedByUserId: "user-1",
      expiresAt: "2026-08-11T12:10:00.000Z",
    });

    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.pacePolicy.findFirst.mock.invocationCallOrder[0]!,
    );
    expect(tx.pacePolicyOverride.create).toHaveBeenCalledWith({
      data: {
        tenantId: "tenant-1",
        childId: override().childId,
        subjectId: override().subjectId,
        pacePolicyId: "policy-1",
        policyCode: "score-below-threshold",
        authorisedByUserId: "user-1",
        reason: "Authorised progression after supervised review",
        expiresAt: new Date("2026-08-11T12:10:00.000Z"),
      },
      select: expect.any(Object),
    });
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: "user-1",
          entityId: "override-1",
          metadata: expect.not.objectContaining({
            reason: "Authorised progression after supervised review",
          }),
        }),
      }),
    );
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          aggregateType: "PACE_POLICY_OVERRIDE",
          aggregateId: "override-1",
          eventType: "ace.pace.policy-override-authorised",
          payload: {},
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("keeps correction audit and outbox in the same RLS transaction", async () => {
    const { service, tx } = arrange();
    tx.outboxEvent.createMany.mockRejectedValue(new Error("outbox unavailable"));

    await expect(
      service.correct("assessment-original", correction(), actor),
    ).rejects.toThrow("outbox unavailable");
    expect(tx.paceAssessment.create).toHaveBeenCalledTimes(1);
    expect(tx.paceProgress.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });
});
