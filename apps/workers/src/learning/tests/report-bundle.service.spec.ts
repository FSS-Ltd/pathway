const withTenantRlsContextMock = jest.fn();

jest.mock("@pathway/db", () => ({
  withTenantRlsContext: (...args: unknown[]) =>
    withTenantRlsContextMock(...args),
}));

import {
  ReportBundleService,
  type ReportBundleWorkerClient,
} from "../report-bundle.service";

describe("ReportBundleService", () => {
  const bundle = {
    id: "bundle-1",
    tenantId: "tenant-1",
    childId: null,
    periodStart: new Date("2026-07-01"),
    periodEnd: new Date("2026-07-31"),
  };
  const reportBundleFindFirst = jest.fn();
  const reportBundleUpdateMany = jest.fn();
  const learningLogFindMany = jest.fn();
  const client = {
    reportBundle: {
      findFirst: reportBundleFindFirst,
      updateMany: reportBundleUpdateMany,
    },
    learningLog: { findMany: learningLogFindMany },
  } as unknown as ReportBundleWorkerClient;
  const storage = { uploadCsv: jest.fn() };
  let service: ReportBundleService;

  beforeEach(() => {
    jest.clearAllMocks();
    withTenantRlsContextMock.mockImplementation(
      async (
        _tenantId: string,
        _orgId: string,
        callback: (tx: ReportBundleWorkerClient) => Promise<unknown>,
      ) => callback(client),
    );
    service = new ReportBundleService(client, storage);
    reportBundleUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("generates a ready CSV bundle containing only logs in the requested period", async () => {
    reportBundleFindFirst.mockResolvedValue(bundle);
    learningLogFindMany.mockResolvedValue([
      {
        id: "log-1",
        activityDate: new Date("2026-07-10"),
        title: "Reading",
        minutes: 30,
        description: "Chapter one",
        child: { firstName: "Ada", lastName: "Lovelace" },
        subject: { name: "English" },
      },
      {
        id: "log-2",
        activityDate: new Date("2026-06-30"),
        title: "Out of range",
        minutes: 20,
        description: null,
        child: { firstName: "Ada", lastName: "Lovelace" },
        subject: { name: "English" },
      },
    ]);
    storage.uploadCsv.mockResolvedValue(undefined);

    await service.run(bundle.id, bundle.tenantId, "org-1");

    expect(learningLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: bundle.tenantId,
          activityDate: { gte: bundle.periodStart, lte: bundle.periodEnd },
        }),
      }),
    );
    expect(storage.uploadCsv).toHaveBeenCalledWith(
      "tenants/tenant-1/reports/bundle-1/bundle.csv",
      expect.stringContaining("Ada Lovelace"),
    );
    expect(storage.uploadCsv).toHaveBeenCalledWith(
      expect.any(String),
      expect.not.stringContaining("Out of range"),
    );
    expect(reportBundleUpdateMany).toHaveBeenCalledWith({
      where: { id: bundle.id, tenantId: bundle.tenantId, status: "PENDING" },
      data: { status: "GENERATING", failureReason: null },
    });
    expect(reportBundleUpdateMany).toHaveBeenLastCalledWith({
      where: { id: bundle.id, tenantId: bundle.tenantId, status: "GENERATING" },
      data: expect.objectContaining({
        status: "READY",
        storageKey: "tenants/tenant-1/reports/bundle-1/bundle.csv",
        completedAt: expect.any(Date),
      }),
    });
  });

  it("creates a header-only ready bundle when no logs match", async () => {
    reportBundleFindFirst.mockResolvedValue(bundle);
    learningLogFindMany.mockResolvedValue([]);
    storage.uploadCsv.mockResolvedValue(undefined);

    await service.run(bundle.id, bundle.tenantId, "org-1");

    expect(storage.uploadCsv).toHaveBeenCalledWith(
      expect.any(String),
      "activityDate,child,subject,title,minutes,description\n",
    );
  });

  it("records a failure reason when storage upload fails", async () => {
    reportBundleFindFirst.mockResolvedValue(bundle);
    learningLogFindMany.mockResolvedValue([]);
    storage.uploadCsv.mockRejectedValue(new Error("storage unavailable"));

    await expect(
      service.run(bundle.id, bundle.tenantId, "org-1"),
    ).rejects.toThrow("storage unavailable");

    expect(reportBundleUpdateMany).toHaveBeenLastCalledWith({
      where: { id: bundle.id, tenantId: bundle.tenantId, status: "GENERATING" },
      data: expect.objectContaining({
        status: "FAILED",
        failureReason: "storage unavailable",
      }),
    });
    expect(reportBundleUpdateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "READY" }) }),
    );
  });

  it("does not generate a bundle when another worker has already claimed it", async () => {
    reportBundleFindFirst.mockResolvedValue(bundle);
    reportBundleUpdateMany.mockResolvedValueOnce({ count: 0 });

    await expect(
      service.run(bundle.id, bundle.tenantId, "org-1"),
    ).rejects.toThrow("Report bundle is no longer pending");

    expect(reportBundleUpdateMany).toHaveBeenCalledTimes(1);
    expect(storage.uploadCsv).not.toHaveBeenCalled();
  });
});
