import {
  RebuildPaceProgressJob,
  type PaceProgressTenantRunner,
} from "../rebuild-pace-progress.job";

const tenant = { id: "tenant-1", orgId: "org-1" };
const factCreatedAt = new Date("2026-08-11T12:30:00.000Z");

interface EnrollmentFixture {
  id: string;
  tenantId: string;
  childId: string;
  subjectId: string;
  startingPace: number;
  currentPace: number;
  targetPace: number;
}

interface AssessmentFixture {
  id: string;
  childId: string;
  subjectId: string;
  paceNumber: number;
  assessmentType: "SELF_TEST" | "PACE_TEST";
  result: "PASSED" | "FAILED";
  assessedOn: Date;
  correctsAssessmentId: string | null;
  policyOverrideId: string | null;
  createdAt: Date;
}

interface ProgressFixture {
  childId: string;
  subjectId: string;
  trackStatus: "AHEAD" | "ON_TRACK" | "AT_RISK" | "BEHIND" | "BLOCKED";
  blockCode: string | null;
  currentPace: number;
  targetPace: number;
  completedPaces: number;
  lastAssessmentId: string | null;
  rebuiltAt: Date;
}

interface HarnessOptions {
  enrollments?: EnrollmentFixture[];
  assessments?: AssessmentFixture[];
  progress?: ProgressFixture[];
}

const defaultEnrollment: EnrollmentFixture = {
  id: "enrollment-1",
  tenantId: tenant.id,
  childId: "child-1",
  subjectId: "subject-1",
  startingPace: 1,
  currentPace: 3,
  targetPace: 12,
};

const defaultAssessments: AssessmentFixture[] = [
  {
    id: "assessment-original",
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: 1,
    assessmentType: "PACE_TEST",
    result: "PASSED",
    assessedOn: new Date("2026-08-09T12:00:00.000Z"),
    correctsAssessmentId: null,
    policyOverrideId: null,
    createdAt: new Date("2026-08-09T12:00:00.000Z"),
  },
  {
    id: "assessment-correction",
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: 1,
    assessmentType: "PACE_TEST",
    result: "FAILED",
    assessedOn: new Date("2026-08-09T12:00:00.000Z"),
    correctsAssessmentId: "assessment-original",
    policyOverrideId: null,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
  },
  {
    id: "assessment-override",
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: 1,
    assessmentType: "PACE_TEST",
    result: "FAILED",
    assessedOn: new Date("2026-08-10T12:00:00.000Z"),
    correctsAssessmentId: null,
    policyOverrideId: "override-1",
    createdAt: factCreatedAt,
  },
];

function assessmentHistory(length: number): AssessmentFixture[] {
  return Array.from({ length }, (_, index) => ({
    id: `fact-${String(index).padStart(4, "0")}`,
    childId: "child-1",
    subjectId: "subject-1",
    paceNumber: 1,
    assessmentType: "SELF_TEST",
    result: "FAILED",
    assessedOn: new Date("2026-08-10T12:00:00.000Z"),
    correctsAssessmentId: null,
    policyOverrideId: null,
    createdAt: new Date("2026-08-10T12:00:00.000Z"),
  }));
}

function projectionKey(value: { childId: string; subjectId: string }): string {
  return `${value.childId}:${value.subjectId}`;
}

function createHarness(options: HarnessOptions = {}) {
  const enrollments = options.enrollments ?? [defaultEnrollment];
  const assessments = options.assessments ?? defaultAssessments;
  const progress = options.progress ?? [];
  const storedProgress = new Map<string, Record<string, unknown>>(
    progress.map((row) => [
      projectionKey(row),
      { tenantId: tenant.id, ...row },
    ]),
  );
  const tx = {
    studentSubjectEnrollment: {
      findMany: jest.fn(async ({ where, take }: Record<string, unknown>) => {
        const afterId = (where as { id?: { gt?: string } } | undefined)?.id?.gt;
        const page = afterId
          ? enrollments.filter((item) => item.id > afterId)
          : enrollments;
        return page.slice(0, take as number);
      }),
    },
    paceAssessment: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    $queryRaw: jest.fn().mockImplementation(async () => {
      const grouped = new Map<string, AssessmentFixture[]>();
      for (const fact of assessments) {
        const key = projectionKey(fact);
        grouped.set(key, [...(grouped.get(key) ?? []), fact]);
      }
      return [...grouped.values()].flatMap((facts) => facts.slice(0, 501));
    }),
    $executeRaw: jest.fn().mockResolvedValue(1),
    paceProgress: {
      findMany: jest.fn().mockResolvedValue(progress),
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: {
            tenantId_childId_subjectId: {
              childId: string;
              subjectId: string;
            };
          };
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = projectionKey(where.tenantId_childId_subjectId);
          storedProgress.set(key, {
            ...(storedProgress.get(key) ?? create),
            ...(storedProgress.has(key) ? update : {}),
          });
          return storedProgress.get(key);
        },
      ),
    },
  };
  const client = {
    tenant: { findMany: jest.fn().mockResolvedValue([tenant]) },
  };
  const withTenantContext: jest.MockedFunction<PaceProgressTenantRunner> =
    jest.fn(async (_tenantId: string, _orgId: string, callback) =>
      callback(tx as never),
    );
  return { client, tx, withTenantContext, storedProgress };
}

describe("RebuildPaceProgressJob", () => {
  afterEach(() => jest.useRealTimers());

  it("rebuilds from the immutable placement baseline and correction facts idempotently", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-11T13:00:00.000Z"));
    const harness = createHarness();
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    const first = await job.run({ batchSize: 1 });
    const firstProjection = harness.storedProgress.get("child-1:subject-1");
    const second = await job.run({ batchSize: 1 });
    const secondProjection = harness.storedProgress.get("child-1:subject-1");

    expect(first).toEqual({
      tenants: 1,
      batches: 1,
      scanned: 1,
      rebuilt: 1,
      skippedUnrebuildable: 0,
      skippedFactHistory: 0,
    });
    expect(second).toEqual(first);
    expect(secondProjection).toEqual(firstProjection);
    expect(secondProjection).toEqual(
      expect.objectContaining({
        tenantId: tenant.id,
        childId: "child-1",
        subjectId: "subject-1",
        currentPace: 2,
        targetPace: 12,
        completedPaces: 1,
        trackStatus: "BEHIND",
        blockCode: null,
        lastAssessmentId: "assessment-override",
        rebuiltAt: new Date("2026-08-11T13:00:00.000Z"),
      }),
    );
    expect(harness.tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(harness.tx.paceAssessment.create).not.toHaveBeenCalled();
    expect(harness.tx.paceAssessment.update).not.toHaveBeenCalled();
    expect(harness.tx.paceAssessment.delete).not.toHaveBeenCalled();
  });

  it("captures rebuiltAt after the batch fact snapshot", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-11T12:00:00.000Z"));
    const harness = createHarness();
    harness.tx.$queryRaw.mockImplementationOnce(async () => {
      jest.setSystemTime(new Date("2026-08-11T13:00:00.000Z"));
      return defaultAssessments;
    });
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await job.run({ batchSize: 1 });

    const projection = harness.storedProgress.get("child-1:subject-1");
    expect(projection?.rebuiltAt).toEqual(new Date("2026-08-11T13:00:00.000Z"));
    expect((projection?.rebuiltAt as Date).getTime()).toBeGreaterThanOrEqual(
      factCreatedAt.getTime(),
    );
  });

  it("preserves and reports blocked and warning projections on repeated runs", async () => {
    const blockedEnrollment = { ...defaultEnrollment, id: "enrollment-1" };
    const warningEnrollment = {
      ...defaultEnrollment,
      id: "enrollment-2",
      childId: "child-2",
    };
    const protectedProgress: ProgressFixture[] = [
      {
        childId: "child-1",
        subjectId: "subject-1",
        trackStatus: "BLOCKED",
        blockCode: "hard-policy-block",
        currentPace: 1,
        targetPace: 12,
        completedPaces: 0,
        lastAssessmentId: null,
        rebuiltAt: new Date("2026-08-10T10:00:00.000Z"),
      },
      {
        childId: "child-2",
        subjectId: "subject-1",
        trackStatus: "ON_TRACK",
        blockCode: "daily-limit-warning",
        currentPace: 2,
        targetPace: 2,
        completedPaces: 1,
        lastAssessmentId: "warning-fact",
        rebuiltAt: new Date("2026-08-10T11:00:00.000Z"),
      },
    ];
    const harness = createHarness({
      enrollments: [blockedEnrollment, warningEnrollment],
      progress: protectedProgress,
    });
    const before = [...harness.storedProgress.entries()];
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    const first = await job.run({ batchSize: 10 });
    const second = await job.run({ batchSize: 10 });

    expect(first).toEqual({
      tenants: 1,
      batches: 1,
      scanned: 2,
      rebuilt: 0,
      skippedUnrebuildable: 2,
      skippedFactHistory: 0,
    });
    expect(second).toEqual(first);
    expect([...harness.storedProgress.entries()]).toEqual(before);
    expect(harness.tx.paceProgress.upsert).not.toHaveBeenCalled();
    expect(harness.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("skips and reports an oversized fact history without folding a partial history", async () => {
    const oversizedHistory = assessmentHistory(501);
    const existing: ProgressFixture = {
      childId: "child-1",
      subjectId: "subject-1",
      trackStatus: "BEHIND",
      blockCode: null,
      currentPace: 1,
      targetPace: 12,
      completedPaces: 0,
      lastAssessmentId: "fact-0500",
      rebuiltAt: new Date("2026-08-10T13:00:00.000Z"),
    };
    const harness = createHarness({
      assessments: oversizedHistory,
      progress: [existing],
    });
    const before = harness.storedProgress.get("child-1:subject-1");
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await expect(job.run({ batchSize: 1 })).resolves.toEqual({
      tenants: 1,
      batches: 1,
      scanned: 1,
      rebuilt: 0,
      skippedUnrebuildable: 0,
      skippedFactHistory: 1,
    });
    expect(harness.storedProgress.get("child-1:subject-1")).toEqual(before);
    expect(harness.tx.$queryRaw).toHaveBeenCalledTimes(1);
    const factQuery = harness.tx.$queryRaw.mock.calls[0][0] as {
      strings: readonly string[];
      values: readonly unknown[];
    };
    expect(factQuery.strings.join("?")).toContain('ranked."factRow" <= ?');
    expect(factQuery.values).toContain(501);
    expect(harness.tx.paceProgress.upsert).not.toHaveBeenCalled();
  });

  it("rebuilds an exact 500-fact history at the deterministic safety boundary", async () => {
    const harness = createHarness({ assessments: assessmentHistory(500) });
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await expect(job.run({ batchSize: 1 })).resolves.toEqual({
      tenants: 1,
      batches: 1,
      scanned: 1,
      rebuilt: 1,
      skippedUnrebuildable: 0,
      skippedFactHistory: 0,
    });
    expect(harness.tx.paceProgress.upsert).toHaveBeenCalledTimes(1);
  });

  it("uses bounded pages and applies tenant RLS to every batch", async () => {
    const harness = createHarness();
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await job.run({ batchSize: 1 });

    expect(harness.withTenantContext).toHaveBeenCalledWith(
      tenant.id,
      tenant.orgId,
      expect.any(Function),
    );
    expect(harness.tx.studentSubjectEnrollment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: tenant.id,
          status: "ACTIVE",
        }),
        orderBy: { id: "asc" },
        take: 1,
      }),
    );
    expect(
      harness.tx.studentSubjectEnrollment.findMany.mock.calls[1][0],
    ).toEqual(
      expect.objectContaining({
        where: {
          tenantId: tenant.id,
          status: "ACTIVE",
          id: { gt: "enrollment-1" },
        },
      }),
    );
    expect(harness.tx.paceProgress.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: tenant.id }),
      }),
    );
    expect(harness.tx.$executeRaw).toHaveBeenCalledTimes(1);
    expect(harness.tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
      harness.tx.paceProgress.findMany.mock.invocationCallOrder[0],
    );
    expect(harness.tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rejects an unbounded batch size before tenant discovery", async () => {
    const harness = createHarness();
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await expect(job.run({ batchSize: 501 })).rejects.toThrow("batchSize");
    expect(harness.client.tenant.findMany).not.toHaveBeenCalled();
  });
});
