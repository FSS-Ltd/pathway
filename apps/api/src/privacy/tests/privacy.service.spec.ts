const dataExportCreate = jest.fn();
const dataExportUpdate = jest.fn();
const dataExportFindMany = jest.fn();
const dataExportFindFirst = jest.fn();
const accountDeletionCreate = jest.fn();
const childFindMany = jest.fn();
const learningLogFindMany = jest.fn();
const tenantFindUniqueOrThrow = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    dataExportRequest: {
      create: dataExportCreate,
      update: dataExportUpdate,
      findMany: dataExportFindMany,
      findFirst: dataExportFindFirst,
    },
    accountDeletionRequest: {
      create: accountDeletionCreate,
    },
    child: { findMany: childFindMany },
    learningLog: { findMany: learningLogFindMany },
    tenant: { findUniqueOrThrow: tenantFindUniqueOrThrow },
  },
}));

import { ServiceUnavailableException } from "@nestjs/common";
import { PrivacyService } from "../privacy.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { MailerService } from "../../mailer/mailer.service";

describe("PrivacyService", () => {
  const tenantId = "tenant-a";
  const userId = "user-a";
  const storage = {
    uploadObject: jest.fn(),
    downloadObject: jest.fn(),
  } as unknown as SupabaseStorageService;
  const mailer = {
    sendAccountDeletionRequestEmail: jest.fn(),
  } as unknown as MailerService;
  let service: PrivacyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrivacyService(storage, mailer);
  });

  describe("requestExport", () => {
    it("creates the export request, generates and uploads the zip, and marks it READY", async () => {
      dataExportCreate.mockResolvedValueOnce({ id: "exp1", status: "PENDING", kind: "FAMILY_DATA" });
      childFindMany.mockResolvedValueOnce([
        { id: "child-1", firstName: "Maya", preferredName: null, dateOfBirth: new Date("2015-01-01"), notes: "Loves maths" },
      ]);
      learningLogFindMany.mockResolvedValueOnce([
        {
          activityDate: new Date("2026-07-10"),
          title: "Reading practice",
          minutes: 30,
          description: "Read two chapters",
          childId: "child-1",
          subject: { name: "English" },
        },
      ]);
      tenantFindUniqueOrThrow.mockResolvedValueOnce({
        name: "The Test Household",
        planningPreferences: { weekStartsOn: "MONDAY" },
        notificationPreferences: { emailDigest: true },
      });
      (storage.uploadObject as jest.Mock).mockResolvedValueOnce({
        bucket: "private",
        key: "tenants/tenant-a/privacy-exports/exp1/export.zip",
      });
      dataExportUpdate.mockResolvedValueOnce({ id: "exp1", status: "READY", storageKey: "expected-key" });

      const result = await service.requestExport("FAMILY_DATA", tenantId, userId);

      expect(dataExportCreate).toHaveBeenCalledWith({
        data: { tenantId, requestedById: userId, kind: "FAMILY_DATA", status: "PENDING" },
        select: expect.any(Object),
      });
      expect(storage.uploadObject).toHaveBeenCalledWith(
        expect.objectContaining({
          bucket: "private",
          key: "tenants/tenant-a/privacy-exports/exp1/export.zip",
          contentType: "application/zip",
        }),
      );
      const uploadedZip = (storage.uploadObject as jest.Mock).mock.calls[0][0].body;
      expect(Buffer.isBuffer(uploadedZip)).toBe(true);
      expect(uploadedZip.slice(0, 2).toString()).toBe("PK");
      expect(dataExportUpdate).toHaveBeenCalledWith({
        where: { id: "exp1" },
        data: { status: "READY", storageKey: "tenants/tenant-a/privacy-exports/exp1/export.zip" },
        select: expect.any(Object),
      });
      expect(result.status).toBe("READY");
    });

    it("throws when the export file cannot be stored", async () => {
      dataExportCreate.mockResolvedValueOnce({ id: "exp1" });
      childFindMany.mockResolvedValueOnce([]);
      learningLogFindMany.mockResolvedValueOnce([]);
      tenantFindUniqueOrThrow.mockResolvedValueOnce({
        name: "Household",
        planningPreferences: {},
        notificationPreferences: {},
      });
      (storage.uploadObject as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.requestExport("REPORT_ARCHIVE", tenantId, userId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(dataExportUpdate).not.toHaveBeenCalled();
    });
  });

  describe("listExports", () => {
    it("lists export requests within the current tenant, newest first", async () => {
      dataExportFindMany.mockResolvedValueOnce([]);

      await expect(service.listExports(tenantId)).resolves.toEqual([]);
      expect(dataExportFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId }, orderBy: { createdAt: "desc" } }),
      );
    });
  });

  describe("getExportFile", () => {
    it("scopes downloads to a ready export in the current tenant", async () => {
      dataExportFindFirst.mockResolvedValueOnce({ id: "exp1", storageKey: "tenants/tenant-a/privacy-exports/exp1/export.zip" });
      (storage.downloadObject as jest.Mock).mockResolvedValueOnce(Buffer.from("PK\x03\x04"));

      const result = await service.getExportFile("exp1", tenantId);

      expect(dataExportFindFirst).toHaveBeenCalledWith({
        where: { id: "exp1", tenantId, status: "READY" },
        select: { id: true, storageKey: true },
      });
      expect(result).toEqual(expect.objectContaining({ fileName: "exp1.zip", contentType: "application/zip" }));
    });

    // Cross-tenant negative authorization: a user from a different tenant
    // must not be able to download another household's export. The service
    // always includes the caller's own tenantId in the `where` clause
    // (never a client-supplied one - tenantId here comes from
    // @CurrentTenant), so a request scoped to a different tenant than the
    // export belongs to finds no matching row.
    it("returns null when the export belongs to a different tenant", async () => {
      dataExportFindFirst.mockResolvedValueOnce(null);

      const result = await service.getExportFile("exp1", "some-other-tenant");

      expect(dataExportFindFirst).toHaveBeenCalledWith({
        where: { id: "exp1", tenantId: "some-other-tenant", status: "READY" },
        select: { id: true, storageKey: true },
      });
      expect(result).toBeNull();
    });

    it("returns null when the export has no storage key yet", async () => {
      dataExportFindFirst.mockResolvedValueOnce({ id: "exp1", storageKey: null });

      await expect(service.getExportFile("exp1", tenantId)).resolves.toBeNull();
      expect(storage.downloadObject).not.toHaveBeenCalled();
    });
  });

  describe("requestDeletion", () => {
    it("creates the deletion request and notifies support", async () => {
      accountDeletionCreate.mockResolvedValueOnce({
        id: "del1",
        tenantId,
        requestedById: userId,
        reason: "Moving away",
        status: "SUBMITTED",
      });

      const result = await service.requestDeletion(
        { reason: "Moving away" },
        tenantId,
        userId,
        "parent@example.com",
        "Parent Name",
      );

      expect(accountDeletionCreate).toHaveBeenCalledWith({
        data: { tenantId, requestedById: userId, reason: "Moving away" },
        select: expect.any(Object),
      });
      expect(mailer.sendAccountDeletionRequestEmail).toHaveBeenCalledWith({
        requestId: "del1",
        tenantId,
        requesterEmail: "parent@example.com",
        requesterName: "Parent Name",
        reason: "Moving away",
      });
      expect(result.status).toBe("SUBMITTED");
    });

    it("still returns the request when the support notification fails", async () => {
      accountDeletionCreate.mockResolvedValueOnce({ id: "del1", tenantId, requestedById: userId, status: "SUBMITTED" });
      (mailer.sendAccountDeletionRequestEmail as jest.Mock).mockRejectedValueOnce(new Error("Resend down"));

      await expect(service.requestDeletion({}, tenantId, userId)).resolves.toEqual(
        expect.objectContaining({ id: "del1" }),
      );
    });
  });
});
