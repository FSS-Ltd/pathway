const dataExportCreate = jest.fn();
const dataExportUpdate = jest.fn();
const dataExportFindMany = jest.fn();
const dataExportFindFirst = jest.fn();
const accountDeletionCreate = jest.fn();
const childFindMany = jest.fn();
const learningLogFindMany = jest.fn();
const tenantFindUniqueOrThrow = jest.fn();
const evidenceFindMany = jest.fn();
const reportBundleFindMany = jest.fn();
const siteMembershipFindFirst = jest.fn();
const orgMembershipFindFirst = jest.fn();
const userOrgRoleFindFirst = jest.fn();

jest.mock("@pathway/db", () => ({
  OrgRole: { ORG_ADMIN: "ORG_ADMIN", ORG_BILLING: "ORG_BILLING", ORG_MEMBER: "ORG_MEMBER" },
  SiteRole: { SITE_ADMIN: "SITE_ADMIN", STAFF: "STAFF", VIEWER: "VIEWER" },
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
    evidence: { findMany: evidenceFindMany },
    reportBundle: { findMany: reportBundleFindMany },
    siteMembership: { findFirst: siteMembershipFindFirst },
    orgMembership: { findFirst: orgMembershipFindFirst },
    userOrgRole: { findFirst: userOrgRoleFindFirst },
  },
}));

import { ForbiddenException, ServiceUnavailableException } from "@nestjs/common";
import { PrivacyService } from "../privacy.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { MailerService } from "../../mailer/mailer.service";

describe("PrivacyService", () => {
  const tenantId = "tenant-a";
  const orgId = "org-a";
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
    // Default: caller is an org admin, so requestDeletion tests that don't
    // care about authorization aren't blocked by it.
    siteMembershipFindFirst.mockResolvedValue(null);
    orgMembershipFindFirst.mockResolvedValue({ role: "ORG_ADMIN" });
    userOrgRoleFindFirst.mockResolvedValue(null);
    evidenceFindMany.mockResolvedValue([]);
    reportBundleFindMany.mockResolvedValue([]);
  });

  function extractZipEntryNames(): string[] {
    const zip = (storage.uploadObject as jest.Mock).mock.calls[0][0].body as Buffer;
    // Minimal local-file-header scan - avoids adding a zip-reading
    // dependency just to assert on entry names in tests. Each local file
    // header starts with signature 0x04034b50, and the filename directly
    // follows a fixed 30-byte header, with lengths at offsets 26/28.
    const names: string[] = [];
    let offset = 0;
    while (offset < zip.length - 4) {
      if (zip.readUInt32LE(offset) === 0x04034b50) {
        const nameLength = zip.readUInt16LE(offset + 26);
        const extraLength = zip.readUInt16LE(offset + 28);
        const name = zip.toString("utf-8", offset + 30, offset + 30 + nameLength);
        names.push(name);
        offset += 30 + nameLength + extraLength;
      } else {
        offset += 1;
      }
    }
    return names;
  }

  describe("requestExport", () => {
    beforeEach(() => {
      childFindMany.mockResolvedValue([
        { id: "child-1", firstName: "Maya", preferredName: null, dateOfBirth: new Date("2015-01-01"), notes: "Loves maths" },
      ]);
      learningLogFindMany.mockResolvedValue([
        {
          activityDate: new Date("2026-07-10"),
          title: "Reading practice",
          minutes: 30,
          description: "Read two chapters",
          childId: "child-1",
          subject: { name: "English" },
        },
      ]);
      tenantFindUniqueOrThrow.mockResolvedValue({
        name: "The Test Household",
        planningPreferences: { weekStartsOn: "MONDAY" },
        notificationPreferences: { emailDigest: true },
      });
      (storage.uploadObject as jest.Mock).mockResolvedValue({
        bucket: "private",
        key: "tenants/tenant-a/privacy-exports/exp1/export.zip",
      });
    });

    it("creates the export request, generates and uploads the zip, and marks it READY", async () => {
      dataExportCreate.mockResolvedValueOnce({ id: "exp1", status: "PENDING", kind: "FAMILY_DATA" });
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
      (storage.uploadObject as jest.Mock).mockReset().mockResolvedValueOnce(null);

      await expect(service.requestExport("REPORT_ARCHIVE", tenantId, userId)).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      expect(dataExportUpdate).not.toHaveBeenCalled();
    });

    it("includes evidence references (not binary content) for both export kinds", async () => {
      dataExportCreate.mockResolvedValueOnce({ id: "exp1" });
      dataExportUpdate.mockResolvedValueOnce({ id: "exp1", status: "READY" });
      evidenceFindMany.mockResolvedValueOnce([
        {
          id: "ev1",
          title: "Maths worksheet",
          childId: "child-1",
          mimeType: "image/jpeg",
          byteSize: 12345,
          capturedAt: new Date("2026-06-01"),
        },
      ]);

      await service.requestExport("FAMILY_DATA", tenantId, userId);

      expect(evidenceFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } }),
      );
      // Never selects/uploads binary bytes for evidence - references only.
      const selectArg = evidenceFindMany.mock.calls[0][0].select;
      expect(selectArg).not.toHaveProperty("storageKey");
      expect(extractZipEntryNames()).toContain("evidence.json");
    });

    it("includes report-bundles.json only for REPORT_ARCHIVE, not FAMILY_DATA", async () => {
      dataExportCreate.mockResolvedValueOnce({ id: "exp1" });
      dataExportUpdate.mockResolvedValueOnce({ id: "exp1", status: "READY" });
      reportBundleFindMany.mockResolvedValueOnce([
        {
          id: "bundle-1",
          childId: "child-1",
          periodStart: new Date("2026-07-01"),
          periodEnd: new Date("2026-07-20"),
          status: "READY",
          createdAt: new Date("2026-07-21"),
        },
      ]);

      await service.requestExport("REPORT_ARCHIVE", tenantId, userId);

      expect(reportBundleFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tenantId } }),
      );
      expect(extractZipEntryNames()).toContain("report-bundles.json");
    });

    it("does not fetch or include report-bundles.json for FAMILY_DATA", async () => {
      dataExportCreate.mockResolvedValueOnce({ id: "exp1" });
      dataExportUpdate.mockResolvedValueOnce({ id: "exp1", status: "READY" });

      await service.requestExport("FAMILY_DATA", tenantId, userId);

      expect(reportBundleFindMany).not.toHaveBeenCalled();
      expect(extractZipEntryNames()).not.toContain("report-bundles.json");
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
    it("creates the deletion request and notifies support when the caller is an org admin", async () => {
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
        orgId,
        userId,
        "parent@example.com",
        "Parent Name",
      );

      expect(orgMembershipFindFirst).toHaveBeenCalledWith({
        where: { userId, orgId, role: "ORG_ADMIN" },
      });
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

      await expect(service.requestDeletion({}, tenantId, orgId, userId)).resolves.toEqual(
        expect.objectContaining({ id: "del1" }),
      );
    });

    // Negative authorization: a household member with no site/org-admin
    // role (e.g. a VIEWER-role adult) must not be able to request deletion
    // of the whole household - this is a more consequential action than
    // anything else in this plan gated by plain AuthUserGuard.
    it("rejects a caller who is not a site or org admin", async () => {
      siteMembershipFindFirst.mockResolvedValueOnce(null);
      orgMembershipFindFirst.mockResolvedValueOnce(null);
      userOrgRoleFindFirst.mockResolvedValueOnce(null);

      await expect(service.requestDeletion({}, tenantId, orgId, userId)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(accountDeletionCreate).not.toHaveBeenCalled();
      expect(mailer.sendAccountDeletionRequestEmail).not.toHaveBeenCalled();
    });

    it("allows a site admin even without an org-admin role", async () => {
      siteMembershipFindFirst.mockResolvedValueOnce({ role: "SITE_ADMIN" });
      orgMembershipFindFirst.mockResolvedValueOnce(null);
      userOrgRoleFindFirst.mockResolvedValueOnce(null);
      accountDeletionCreate.mockResolvedValueOnce({ id: "del2", tenantId, requestedById: userId, status: "SUBMITTED" });

      await expect(service.requestDeletion({}, tenantId, orgId, userId)).resolves.toEqual(
        expect.objectContaining({ id: "del2" }),
      );
    });
  });
});
