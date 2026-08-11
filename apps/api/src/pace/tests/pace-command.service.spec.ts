import {
  BadRequestException,
  HttpException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { PaceController } from "../pace.controller";
import { PaceCommandService } from "../pace-command.service";
import { createPaceAssessmentSchema } from "../dto/create-pace-assessment.dto";
import type { CreatePaceAssessmentDto } from "../dto/create-pace-assessment.dto";

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
const assessedAt = "2026-08-11T00:30:00.000Z";
const policyOverrideId = "c65f646d-e79d-474c-a8e1-d62bd1d4d154";
const commandFingerprint =
  "ace-pace-assessment:tenant-1:6d182b57fce5fefa5f33ef8939f3e903a261fcc5980cebc0fa2045a238651a52:257c165e6e32217b085842dac8dfa9a216fad740f06a39e2a128086525014dea";

function command(
  overrides: Partial<CreatePaceAssessmentDto> = {},
): CreatePaceAssessmentDto {
  return {
    idempotencyKey: "assessment-command-1",
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: 1001,
    assessmentType: "FinalTest",
    score: 90,
    assessedAt,
    reason: "Completed under normal supervision",
    ...overrides,
  };
}

function transaction() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    $queryRaw: jest.fn().mockResolvedValue([{ count: 0 }]),
    tenant: { findFirst: jest.fn() },
    studentSubjectEnrollment: { findFirst: jest.fn() },
    pacePolicy: { findFirst: jest.fn() },
    pacePolicyOverride: { findFirst: jest.fn() },
    paceAssessment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    paceProgress: { findUnique: jest.fn(), upsert: jest.fn() },
    auditEvent: { create: jest.fn(), findFirst: jest.fn() },
    outboxEvent: {
      findFirst: jest.fn(),
      createMany: jest.fn(),
      findFirstOrThrow: jest.fn(),
    },
  };
}

function assessment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "assessment-1",
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: 1001,
    assessmentType: "PACE_TEST",
    score: 90,
    result: "PASSED",
    assessedOn: new Date("2026-08-10T00:00:00.000Z"),
    correctsAssessmentId: null,
    policyOverrideId: null,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
    reason: "Completed under normal supervision",
    recordedByUserId: "user-1",
    ...overrides,
  };
}

function arrange() {
  const tx = transaction();
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenantId, _orgId, callback) =>
      callback(tx as never),
    );
  tx.tenant.findFirst.mockResolvedValue({ timezone: "America/New_York" });
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
    allowSamePaceSameDay: false,
  });
  tx.pacePolicyOverride.findFirst.mockResolvedValue(null);
  tx.outboxEvent.findFirst.mockResolvedValue(null);
  tx.paceAssessment.findMany.mockResolvedValue([
    assessment({
      id: "self-test-1",
      assessmentType: "SELF_TEST",
      assessedOn: new Date("2026-08-09T00:00:00.000Z"),
    }),
  ]);
  tx.paceAssessment.findFirst.mockResolvedValue(null);
  tx.paceAssessment.create.mockResolvedValue(assessment());
  tx.paceProgress.upsert.mockResolvedValue({
    currentPace: 1002,
    targetPace: 1002,
    completedPaces: 1,
    trackStatus: "ON_TRACK",
    blockCode: null,
    lastAssessmentId: "assessment-1",
    rebuiltAt: new Date("2026-08-11T00:30:00.000Z"),
  });
  tx.auditEvent.create.mockResolvedValue({});
  tx.auditEvent.findFirst.mockResolvedValue({
    metadata: {
      policyDecision: "allow",
      policyCode: "allowed",
      policyNextPace: 1002,
      progress: {
        currentPace: 1002,
        targetPace: 1002,
        completedPaces: 1,
        trackStatus: "ON_TRACK",
        blockCode: null,
        lastAssessmentId: "assessment-1",
        rebuiltAt: "2026-08-10T12:00:00.000Z",
      },
    },
  });
  tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
  tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });
  return { service: new PaceCommandService(new OutboxService()), tx };
}

describe("PaceCommandService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("protects the assessment command with ace.pace.record", () => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSION,
        PaceController.prototype.recordAssessment,
      ),
    ).toBe("ace.pace.record");
  });

  it("validates the bounded client command DTO", async () => {
    await expect(
      createPaceAssessmentSchema.parseAsync({
        ...command(),
        childId: "5dce6037-f0e3-46e6-8463-2013e4251ed0",
        subjectId: "7a7450c4-54ad-407e-8388-90185ff9a5f6",
      }),
    ).resolves.toMatchObject({ assessmentType: "FinalTest", score: 90 });
    expect(() =>
      createPaceAssessmentSchema.parse({ ...command(), score: 101 }),
    ).toThrow();
    expect(() =>
      createPaceAssessmentSchema.parse({ ...command(), unexpected: "field" }),
    ).toThrow();
  });

  it("uses the selected site's IANA timezone for the assessed local date and commits fact, projection, audit, and a content-free intent", async () => {
    const { service, tx } = arrange();

    await expect(service.record(command(), actor)).resolves.toMatchObject({
      assessment: {
        id: "assessment-1",
        assessedOn: "2026-08-10",
        result: "passed",
      },
      progress: { currentPace: 1002, trackStatus: "ON_TRACK" },
      policy: { decision: "allow", code: "allowed" },
      duplicate: false,
    });

    expect(withTenantRlsContext).toHaveBeenCalledWith(
      "tenant-1",
      "org-1",
      expect.any(Function),
    );
    expect(tx.$executeRaw).toHaveBeenCalledWith(
      expect.objectContaining({
        values: expect.arrayContaining([
          "ace-pace-assessment:tenant-1:child-1",
        ]),
      }),
    );
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.paceAssessment.findMany.mock.invocationCallOrder[0]!,
    );
    expect(tx.tenant.findFirst).toHaveBeenCalledWith({
      where: { id: "tenant-1", orgId: "org-1" },
      select: { timezone: true },
    });
    expect(tx.paceAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assessedOn: new Date("2026-08-10T12:00:00.000Z"),
          reason: "Completed under normal supervision",
          recordedByUserId: "user-1",
        }),
      }),
    );
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.not.objectContaining({
            reason: "Completed under normal supervision",
          }),
        }),
      }),
    );
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventType: "ace.pace.assessment-recorded",
          aggregateId: "assessment-1",
          payload: {},
        }),
      ],
      skipDuplicates: true,
    });
  });

  it("returns a stable duplicate result without a second fact, projection, audit, or intent", async () => {
    const { service, tx } = arrange();
    tx.outboxEvent.findFirst.mockResolvedValue({
      aggregateId: "assessment-1",
      idempotencyKey: commandFingerprint,
    });
    tx.paceAssessment.findMany.mockResolvedValue([
      assessment({
        id: "self-test-1",
        assessmentType: "SELF_TEST",
        assessedOn: new Date("2026-08-09T00:00:00.000Z"),
      }),
      assessment(),
    ]);
    tx.paceAssessment.findFirst.mockResolvedValue(assessment());
    tx.paceProgress.findUnique.mockResolvedValue({
      currentPace: 1002,
      targetPace: 1002,
      completedPaces: 1,
      trackStatus: "ON_TRACK",
      blockCode: null,
      lastAssessmentId: "assessment-1",
      rebuiltAt: new Date("2026-08-11T00:30:00.000Z"),
    });

    await expect(service.record(command(), actor)).resolves.toMatchObject({
      assessment: { id: "assessment-1" },
      policy: {
        decision: "allow",
        code: "allowed",
        nextPace: { raw: 1002, level: 1, sequence: 2 },
      },
      progress: {
        currentPace: 1002,
        targetPace: 1002,
        completedPaces: 1,
        trackStatus: "ON_TRACK",
        blockCode: null,
        lastAssessmentId: "assessment-1",
        rebuiltAt: "2026-08-10T12:00:00.000Z",
      },
      duplicate: true,
    });
    expect(tx.paceAssessment.create).not.toHaveBeenCalled();
    expect(tx.paceProgress.upsert).not.toHaveBeenCalled();
    expect(tx.auditEvent.create).not.toHaveBeenCalled();
    expect(tx.outboxEvent.createMany).not.toHaveBeenCalled();
    expect(tx.paceProgress.findUnique).not.toHaveBeenCalled();
  });

  it("rejects reuse of an idempotency key for different immutable command content", async () => {
    const { service, tx } = arrange();
    tx.outboxEvent.findFirst.mockResolvedValue({
      aggregateId: "assessment-1",
      idempotencyKey: "stored-command-fingerprint",
    });

    await expect(
      service.record(command({ score: 81 }), actor),
    ).rejects.toMatchObject({
      response: {
        statusCode: 409,
        code: "PACE_IDEMPOTENCY_CONFLICT",
      },
    });
    expect(tx.paceAssessment.findFirst).not.toHaveBeenCalled();
  });

  it("does not treat a superseded correction predecessor as a duplicate or policy fact", async () => {
    const { service, tx } = arrange();
    tx.paceAssessment.findMany.mockResolvedValue([
      assessment({
        id: "self-test-1",
        assessmentType: "SELF_TEST",
        assessedOn: new Date("2026-08-09T00:00:00.000Z"),
      }),
      assessment({ id: "superseded-final" }),
      assessment({
        id: "correction-final",
        paceNumber: 1002,
        score: 70,
        result: "FAILED",
        correctsAssessmentId: "superseded-final",
        createdAt: new Date("2026-08-10T13:00:00.000Z"),
      }),
    ]);

    await service.record(command(), actor);

    expect(tx.paceAssessment.create).toHaveBeenCalledTimes(1);
    expect(tx.paceProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ currentPace: 1002 }),
      }),
    );
  });

  it("returns a safe machine-readable policy error for daily-limit and same-day blocks", async () => {
    const { service, tx } = arrange();
    tx.$queryRaw.mockResolvedValue([{ count: 2 }]);

    let thrown: unknown;
    try {
      await service.record(command(), actor);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getResponse()).toEqual({
      statusCode: 409,
      code: "PACE_POLICY_BLOCKED",
      message: "The PACE assessment is blocked by site policy.",
      details: { policyCode: "daily-limit" },
    });
    expect(
      JSON.stringify((thrown as HttpException).getResponse()),
    ).not.toContain("Completed under normal supervision");
    expect(tx.paceAssessment.create).not.toHaveBeenCalled();

    tx.$queryRaw.mockResolvedValue([{ count: 0 }]);
    tx.paceAssessment.findMany.mockResolvedValue([
      assessment({ assessmentType: "SELF_TEST" }),
    ]);
    await expect(service.record(command(), actor)).rejects.toMatchObject({
      response: {
        code: "PACE_POLICY_BLOCKED",
        details: { policyCode: "same-pace-same-day" },
      },
    });
  });

  it("binds an explicit unused scoped override to the assessment that consumes it", async () => {
    const { service, tx } = arrange();
    tx.pacePolicyOverride.findFirst.mockResolvedValue({
      id: policyOverrideId,
    });
    tx.paceAssessment.create.mockResolvedValue(
      assessment({ score: 70, result: "FAILED" }),
    );

    await expect(
      service.record(
        command({ score: 70, policyOverrideId }),
        actor,
      ),
    ).resolves.toMatchObject({
      policy: { decision: "allow", code: "allowed" },
    });
    expect(tx.pacePolicyOverride.findFirst).toHaveBeenCalledWith({
      where: {
        id: policyOverrideId,
        tenantId: "tenant-1",
        childId: "child-1",
        subjectId: "subject-1",
        pacePolicyId: "policy-1",
        policyCode: "score-below-threshold",
        assessmentFingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
        expiresAt: { gt: expect.any(Date) },
        assessments: { none: {} },
      },
      select: { id: true },
    });
    expect(tx.paceAssessment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ policyOverrideId }),
      }),
    );
  });

  it("rejects an explicit override that is expired, consumed, or outside the command scope", async () => {
    const { service, tx } = arrange();

    await expect(
      service.record(
        command({
          score: 70,
          policyOverrideId: "2259ad17-8ce4-41cf-8b02-5be08a6154a2",
        }),
        actor,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: "PACE_POLICY_OVERRIDE_INVALID" }),
    });
    expect(tx.paceAssessment.create).not.toHaveBeenCalled();
  });

  it("uses allow-listed active-site reads and rejects invalid site, child/subject placement, and timezone", async () => {
    const { service, tx } = arrange();
    tx.tenant.findFirst.mockResolvedValue(null);
    await expect(service.record(command(), actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    tx.tenant.findFirst.mockResolvedValue({ timezone: "Mars/Olympus" });
    await expect(service.record(command(), actor)).rejects.toBeInstanceOf(
      BadRequestException,
    );

    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.studentSubjectEnrollment.findFirst.mockResolvedValue(null);
    await expect(service.record(command(), actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("lets an outbox failure escape the RLS transaction so no partial commit can be acknowledged", async () => {
    const { service, tx } = arrange();
    tx.outboxEvent.createMany.mockRejectedValue(
      new Error("outbox unavailable"),
    );

    await expect(service.record(command(), actor)).rejects.toThrow(
      "outbox unavailable",
    );
    expect(tx.paceAssessment.create).toHaveBeenCalledTimes(1);
    expect(tx.paceProgress.upsert).toHaveBeenCalledTimes(1);
    expect(tx.auditEvent.create).toHaveBeenCalledTimes(1);
  });
});
