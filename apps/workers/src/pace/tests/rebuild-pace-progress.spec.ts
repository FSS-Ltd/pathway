import {
  RebuildPaceProgressJob,
  type PaceProgressTenantRunner,
} from "../rebuild-pace-progress.job";

const tenant = { id: "tenant-1", orgId: "org-1" };
const rebuiltAt = new Date("2026-08-11T12:00:00.000Z");

function createHarness() {
  const storedProgress = new Map<string, Record<string, unknown>>();
  const enrollments = [
    {
      id: "enrollment-1",
      tenantId: tenant.id,
      childId: "child-1",
      subjectId: "subject-1",
      startingPace: 1,
      currentPace: 1,
      targetPace: 12,
    },
  ];
  const assessments = [
    {
      id: "assessment-original",
      childId: "child-1",
      subjectId: "subject-1",
      paceNumber: 1,
      assessmentType: "PACE_TEST" as const,
      result: "PASSED" as const,
      assessedOn: new Date("2026-08-09T12:00:00.000Z"),
      correctsAssessmentId: null,
      policyOverrideId: null,
    },
    {
      id: "assessment-correction",
      childId: "child-1",
      subjectId: "subject-1",
      paceNumber: 1,
      assessmentType: "PACE_TEST" as const,
      result: "FAILED" as const,
      assessedOn: new Date("2026-08-09T12:00:00.000Z"),
      correctsAssessmentId: "assessment-original",
      policyOverrideId: null,
    },
    {
      id: "assessment-override",
      childId: "child-1",
      subjectId: "subject-1",
      paceNumber: 1,
      assessmentType: "PACE_TEST" as const,
      result: "FAILED" as const,
      assessedOn: new Date("2026-08-10T12:00:00.000Z"),
      correctsAssessmentId: null,
      policyOverrideId: "override-1",
    },
  ];
  const tx = {
    studentSubjectEnrollment: {
      findMany: jest.fn(
        async ({ where, cursor, take }: Record<string, unknown>) => {
          const afterId =
            (where as { id?: { gt?: string } } | undefined)?.id?.gt ??
            (cursor as { id?: string } | undefined)?.id;
          const page = afterId
            ? enrollments.filter((item) => item.id > afterId)
            : enrollments;
          return page.slice(0, take as number);
        },
      ),
    },
    paceAssessment: {
      findMany: jest.fn().mockResolvedValue(assessments),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    paceProgress: {
      upsert: jest.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: Record<string, unknown>;
          create: Record<string, unknown>;
          update: Record<string, unknown>;
        }) => {
          const key = JSON.stringify(where);
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
  it("rebuilds correction and override facts idempotently without writing facts", async () => {
    const harness = createHarness();
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    const first = await job.run({ batchSize: 1, rebuiltAt });
    const firstProjection = [...harness.storedProgress.values()][0];
    const second = await job.run({ batchSize: 1, rebuiltAt });
    const secondProjection = [...harness.storedProgress.values()][0];

    expect(first).toEqual({ tenants: 1, enrollments: 1, batches: 1 });
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
        rebuiltAt,
      }),
    );
    expect(harness.tx.paceAssessment.findMany).toHaveBeenCalledTimes(2);
    expect(harness.tx.paceAssessment.create).not.toHaveBeenCalled();
    expect(harness.tx.paceAssessment.update).not.toHaveBeenCalled();
    expect(harness.tx.paceAssessment.delete).not.toHaveBeenCalled();
  });

  it("uses bounded pages and applies tenant RLS to every batch", async () => {
    const harness = createHarness();
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await job.run({ batchSize: 1, rebuiltAt });

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
    expect(harness.tx.paceAssessment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: tenant.id }),
      }),
    );
  });

  it("rejects an unbounded batch size before tenant discovery", async () => {
    const harness = createHarness();
    const job = new RebuildPaceProgressJob(
      harness.client,
      harness.withTenantContext,
    );

    await expect(job.run({ batchSize: 501, rebuiltAt })).rejects.toThrow(
      "batchSize",
    );
    expect(harness.client.tenant.findMany).not.toHaveBeenCalled();
  });
});
