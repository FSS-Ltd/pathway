import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { StudentSubjectsService } from "../student-subjects.service";

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: jest.fn(),
}));

const actor = { tenantId: "tenant-1", orgId: "org-1", userId: "user-1" };

function command(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    subjectId: "subject-1",
    startsOn: "2026-09-01",
    startingPace: 1,
    currentPace: 2,
    targetPace: 12,
    reason: "Initial diagnostic placement",
    ...overrides,
  };
}

function activeEnrollment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "enrollment-1",
    startsOn: new Date("2026-09-01T12:00:00.000Z"),
    endsOn: null,
    status: "ACTIVE",
    startingPace: 1,
    currentPace: 2,
    targetPace: 12,
    subject: { id: "subject-1", name: "Mathematics" },
    ...overrides,
  };
}

function transaction() {
  return {
    $executeRaw: jest.fn().mockResolvedValue(0),
    tenant: { findFirst: jest.fn() },
    child: { findFirst: jest.fn() },
    subject: { findFirst: jest.fn(), findMany: jest.fn() },
    studentSubjectEnrollment: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    paceAssessment: { findMany: jest.fn().mockResolvedValue([]) },
    paceProgress: { upsert: jest.fn().mockResolvedValue({}) },
    auditEvent: { create: jest.fn() },
    outboxEvent: { createMany: jest.fn(), findFirstOrThrow: jest.fn() },
  };
}

function createService(tx = transaction()) {
  jest
    .mocked(withTenantRlsContext)
    .mockImplementation(async (_tenant, _org, callback) =>
      callback(tx as never),
    );
  return { service: new StudentSubjectsService(), tx };
}

describe("StudentSubjectsService", () => {
  beforeEach(() => jest.clearAllMocks());

  it("lists only active placements and active tenant subject options for an active-site child", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.child.findFirst.mockResolvedValue({ id: "child-1" });
    tx.studentSubjectEnrollment.findMany.mockResolvedValue([
      activeEnrollment(),
    ]);
    tx.subject.findMany.mockResolvedValue([
      { id: "subject-1", name: "Mathematics" },
      { id: "subject-2", name: "English" },
    ]);

    await expect(service.list("child-1", actor)).resolves.toEqual({
      placements: [
        {
          id: "enrollment-1",
          subjectId: "subject-1",
          subjectName: "Mathematics",
          startsOn: "2026-09-01",
          endsOn: null,
          status: "ACTIVE",
          startingPace: 1,
          currentPace: 2,
          targetPace: 12,
        },
      ],
      subjects: [
        { id: "subject-1", name: "Mathematics" },
        { id: "subject-2", name: "English" },
      ],
    });
    expect(withTenantRlsContext).toHaveBeenCalledWith(
      "tenant-1",
      "org-1",
      expect.any(Function),
    );
    expect(tx.studentSubjectEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", childId: "child-1", status: "ACTIVE" },
      }),
    );
    expect(tx.subject.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1", isActive: true },
      }),
    );
  });

  it("rejects a missing tenant child and invalid PACE, date, or reason before writing", async () => {
    const { service, tx } = createService();
    await expect(service.list("child-1", actor)).rejects.toBeInstanceOf(
      NotFoundException,
    );

    await expect(
      service.place("child-1", command({ startingPace: 145 }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.place("child-1", command({ startsOn: "2026-02-30" }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.place("child-1", command({ reason: "  " }), actor),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.studentSubjectEnrollment.create).not.toHaveBeenCalled();
  });

  it("creates an initial active placement with audit and non-sensitive outbox intent", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.child.findFirst.mockResolvedValue({ id: "child-1" });
    tx.subject.findFirst.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
    });
    tx.studentSubjectEnrollment.findFirst.mockResolvedValue(null);
    tx.studentSubjectEnrollment.create.mockResolvedValue(activeEnrollment());
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await expect(
      service.place("child-1", command(), actor),
    ).resolves.toMatchObject({
      id: "enrollment-1",
      subjectId: "subject-1",
      subjectName: "Mathematics",
      status: "ACTIVE",
    });
    expect(tx.studentSubjectEnrollment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: "tenant-1",
          childId: "child-1",
          subjectId: "subject-1",
          recordedByUserId: "user-1",
          reason: "Initial diagnostic placement",
        }),
      }),
    );
    expect(tx.paceProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          tenantId: "tenant-1",
          childId: "child-1",
          subjectId: "subject-1",
          currentPace: 2,
          targetPace: 12,
          completedPaces: 0,
          lastAssessmentId: null,
        }),
      }),
    );
    expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.studentSubjectEnrollment.create.mock.invocationCallOrder[0]!,
    );
    expect(tx.auditEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          actorUserId: "user-1",
          action: "CREATED",
          metadata: expect.objectContaining({
            reason: "Initial diagnostic placement",
          }),
        }),
      }),
    );
    expect(tx.outboxEvent.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            eventType: "ace.student-subject.placed",
            payload: { subjectId: "subject-1" },
          }),
        ],
      }),
    );
  });

  it("rejects inactive or another-tenant subjects and duplicate active placements", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.child.findFirst.mockResolvedValue({ id: "child-1" });
    tx.subject.findFirst.mockResolvedValue(null);
    await expect(
      service.place("child-1", command(), actor),
    ).rejects.toBeInstanceOf(NotFoundException);

    tx.subject.findFirst.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
    });
    tx.studentSubjectEnrollment.findFirst.mockResolvedValue({ id: "existing" });
    await expect(
      service.place("child-1", command(), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("revises only the exact active placement by ending it the day before the replacement", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.child.findFirst.mockResolvedValue({ id: "child-1" });
    tx.subject.findFirst.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
    });
    tx.studentSubjectEnrollment.findFirst.mockResolvedValue(activeEnrollment());
    tx.studentSubjectEnrollment.updateMany.mockResolvedValue({ count: 1 });
    tx.studentSubjectEnrollment.create.mockResolvedValue(
      activeEnrollment({
        id: "enrollment-2",
        startsOn: new Date("2026-09-02T12:00:00.000Z"),
        currentPace: 3,
      }),
    );
    tx.paceAssessment.findMany.mockResolvedValue([
      {
        id: "assessment-2",
        childId: "child-1",
        subjectId: "subject-1",
        paceNumber: 3,
        assessmentType: "PACE_TEST",
        score: 90,
        result: "PASSED",
        assessedOn: new Date("2026-09-03T12:00:00.000Z"),
        correctsAssessmentId: null,
        policyOverrideId: null,
        createdAt: new Date("2026-09-03T12:00:00.000Z"),
        reason: "Completed after revised placement",
        recordedByUserId: "user-1",
      },
    ]);
    tx.auditEvent.create.mockResolvedValue({});
    tx.outboxEvent.createMany.mockResolvedValue({ count: 1 });
    tx.outboxEvent.findFirstOrThrow.mockResolvedValue({ id: "outbox-1" });

    await service.place(
      "child-1",
      command({
        replacesEnrollmentId: "enrollment-1",
        startsOn: "2026-09-02",
        currentPace: 3,
      }),
      actor,
    );
    expect(tx.studentSubjectEnrollment.updateMany).toHaveBeenCalledWith({
      where: {
        id: "enrollment-1",
        tenantId: "tenant-1",
        childId: "child-1",
        subjectId: "subject-1",
        status: "ACTIVE",
      },
      data: { status: "ENDED", endsOn: new Date("2026-09-01T12:00:00.000Z") },
    });
    expect(tx.paceAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: "tenant-1",
          childId: "child-1",
          subjectId: "subject-1",
          assessedOn: { gte: new Date("2026-09-02T12:00:00.000Z") },
        },
      }),
    );
    expect(tx.paceProgress.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          currentPace: 4,
          targetPace: 12,
          completedPaces: 1,
          lastAssessmentId: "assessment-2",
          blockCode: null,
        }),
      }),
    );

    tx.studentSubjectEnrollment.findFirst.mockResolvedValue(null);
    await expect(
      service.place(
        "child-1",
        command({
          replacesEnrollmentId: "other-enrollment",
          startsOn: "2026-09-02",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects revisions that do not start after the active placement and translates database duplicates", async () => {
    const { service, tx } = createService();
    tx.tenant.findFirst.mockResolvedValue({ timezone: "Europe/London" });
    tx.child.findFirst.mockResolvedValue({ id: "child-1" });
    tx.subject.findFirst.mockResolvedValue({
      id: "subject-1",
      name: "Mathematics",
    });
    tx.studentSubjectEnrollment.findFirst.mockResolvedValue(activeEnrollment());
    await expect(
      service.place(
        "child-1",
        command({
          replacesEnrollmentId: "enrollment-1",
          startsOn: "2026-09-01",
        }),
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    tx.studentSubjectEnrollment.findFirst.mockResolvedValue(null);
    tx.studentSubjectEnrollment.create.mockRejectedValue({ code: "P2002" });
    await expect(
      service.place("child-1", command(), actor),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
