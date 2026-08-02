const subjectFindMany = jest.fn();
const subjectCreate = jest.fn();
const learningLogFindMany = jest.fn();
const learningLogFindFirst = jest.fn();
const learningLogCreate = jest.fn();
const evidenceFindMany = jest.fn();
const evidenceFindFirst = jest.fn();
const evidenceCreate = jest.fn();
const reportBundleFindMany = jest.fn();
const reportBundleCreate = jest.fn();
const reportBundleUpdate = jest.fn();
const reportBundleFindFirst = jest.fn();
const childFindFirst = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    subject: { findMany: subjectFindMany, create: subjectCreate },
    learningLog: {
      findMany: learningLogFindMany,
      findFirst: learningLogFindFirst,
      create: learningLogCreate,
    },
    evidence: { findMany: evidenceFindMany, findFirst: evidenceFindFirst, create: evidenceCreate },
    reportBundle: {
      findMany: reportBundleFindMany,
      create: reportBundleCreate,
      update: reportBundleUpdate,
      findFirst: reportBundleFindFirst,
    },
    child: { findFirst: childFindFirst },
  },
}));

import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { LearningService } from "../learning.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";

describe("LearningService", () => {
  const tenantId = "tenant-a";
  const userId = "user-a";
  const storage = {
    downloadObject: jest.fn(),
    uploadObject: jest.fn(),
  } as unknown as SupabaseStorageService;
  let service: LearningService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LearningService(storage);
  });

  it("lists subjects within the current tenant", async () => {
    subjectFindMany.mockResolvedValueOnce([]);

    await expect(service.listSubjects(tenantId)).resolves.toEqual([]);
    expect(subjectFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId },
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      }),
    );
  });

  it("creates a subject in the current tenant", async () => {
    subjectCreate.mockResolvedValueOnce({ id: "subject-1", tenantId });

    await service.createSubject({ name: "Literacy" }, tenantId);

    expect(subjectCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId, name: "Literacy" }),
      }),
    );
  });

  it("lists learning logs within the current tenant", async () => {
    learningLogFindMany.mockResolvedValueOnce([]);

    await expect(service.listLogs(tenantId)).resolves.toEqual([]);
    expect(learningLogFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it("gets a single learning log within the current tenant", async () => {
    learningLogFindFirst.mockResolvedValueOnce({ id: "log-1" });

    await expect(service.getLog("log-1", tenantId)).resolves.toEqual({ id: "log-1" });
    expect(learningLogFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "log-1", tenantId } }),
    );
  });

  it("throws when a learning log is not found in the current tenant", async () => {
    learningLogFindFirst.mockResolvedValueOnce(null);

    await expect(service.getLog("missing", tenantId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("creates a learning log with the current tenant and actor", async () => {
    learningLogCreate.mockResolvedValueOnce({ id: "log-1" });

    await service.createLog(
      {
        childId: "child-1",
        subjectId: "subject-1",
        activityDate: new Date("2026-07-20"),
        minutes: 45,
        title: "Reading practice",
      },
      tenantId,
      userId,
    );

    expect(learningLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId,
          loggedByUserId: userId,
          childId: "child-1",
        }),
      }),
    );
  });

  it("lists evidence within the current tenant", async () => {
    evidenceFindMany.mockResolvedValueOnce([]);

    await expect(service.listEvidence(tenantId)).resolves.toEqual([]);
    expect(evidenceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it("gets a single evidence item within the current tenant", async () => {
    evidenceFindFirst.mockResolvedValueOnce({ id: "evidence-1" });

    await expect(service.getEvidenceById("evidence-1", tenantId)).resolves.toEqual({
      id: "evidence-1",
    });
    expect(evidenceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "evidence-1", tenantId } }),
    );
  });

  it("throws when evidence is not found in the current tenant", async () => {
    evidenceFindFirst.mockResolvedValueOnce(null);

    await expect(service.getEvidenceById("missing", tenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("creates evidence with the current tenant and actor", async () => {
    evidenceCreate.mockResolvedValueOnce({ id: "evidence-1" });

    await service.createEvidence(
      {
        childId: "child-1",
        title: "Writing sample",
        storageKey: "tenants/tenant-a/evidence/writing.txt",
        mimeType: "text/plain",
        byteSize: 5,
      },
      tenantId,
      userId,
    );

    expect(evidenceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId, uploadedByUserId: userId }),
      }),
    );
  });

  it("lists report bundles within the current tenant", async () => {
    reportBundleFindMany.mockResolvedValueOnce([]);

    await expect(service.listReportBundles(tenantId)).resolves.toEqual([]);
    expect(reportBundleFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId } }),
    );
  });

  it("generates a report bundle synchronously and marks it ready", async () => {
    learningLogFindMany.mockResolvedValueOnce([
      {
        activityDate: new Date("2026-07-10"),
        title: "Reading practice",
        minutes: 30,
        description: "Read two chapters",
        subject: { name: "English" },
      },
    ]);
    childFindFirst.mockResolvedValueOnce({ firstName: "Maya", preferredName: null });
    reportBundleCreate.mockResolvedValueOnce({ id: "bundle-1", status: "PENDING" });
    (storage.uploadObject as jest.Mock).mockResolvedValueOnce({
      bucket: "private",
      key: "tenants/tenant-a/reports/bundle-1/bundle.csv",
    });
    reportBundleUpdate.mockResolvedValueOnce({ id: "bundle-1", status: "READY" });

    await service.createReportBundle(
      {
        childId: "child-1",
        periodStart: new Date("2026-07-01"),
        periodEnd: new Date("2026-07-20"),
      },
      tenantId,
      userId,
    );

    expect(reportBundleCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ tenantId, requestedByUserId: userId }),
      }),
    );
    expect(storage.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        bucket: "private",
        key: "tenants/tenant-a/reports/bundle-1/bundle.csv",
        contentType: "text/csv",
      }),
    );
    const uploadedCsv = (storage.uploadObject as jest.Mock).mock.calls[0][0].body.toString("utf-8");
    expect(uploadedCsv).toContain("Maya");
    expect(uploadedCsv).toContain("Reading practice");
    expect(reportBundleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bundle-1" },
        data: expect.objectContaining({ status: "READY" }),
      }),
    );
  });

  it("throws when the report file cannot be stored", async () => {
    learningLogFindMany.mockResolvedValueOnce([]);
    childFindFirst.mockResolvedValueOnce(null);
    reportBundleCreate.mockResolvedValueOnce({ id: "bundle-1" });
    (storage.uploadObject as jest.Mock).mockResolvedValueOnce(null);

    await expect(
      service.createReportBundle(
        { periodStart: new Date("2026-07-01"), periodEnd: new Date("2026-07-20") },
        tenantId,
        userId,
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(reportBundleUpdate).not.toHaveBeenCalled();
  });

  it("gets a single report bundle within the current tenant", async () => {
    reportBundleFindFirst.mockResolvedValueOnce({ id: "bundle-1" });

    await expect(service.getReportBundle("bundle-1", tenantId)).resolves.toEqual({
      id: "bundle-1",
    });
  });

  it("throws when a report bundle is not found in the current tenant", async () => {
    reportBundleFindFirst.mockResolvedValueOnce(null);

    await expect(service.getReportBundle("missing", tenantId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("scopes report bundle downloads to a ready bundle in the current tenant", async () => {
    reportBundleFindFirst.mockResolvedValueOnce({
      id: "bundle-1",
      storageKey: "tenants/tenant-a/reports/bundle-1/bundle.csv",
    });
    (storage.downloadObject as jest.Mock).mockResolvedValueOnce(
      Buffer.from("child,title\nA,Reading"),
    );

    await expect(service.getBundleFile("bundle-1", tenantId)).resolves.toEqual(
      expect.objectContaining({ fileName: "bundle-1.csv" }),
    );
    expect(reportBundleFindFirst).toHaveBeenCalledWith({
      where: { id: "bundle-1", tenantId, status: "READY" },
      select: { id: true, storageKey: true },
    });
  });
});
