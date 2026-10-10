/* eslint-disable @typescript-eslint/no-explicit-any */
const findMany = jest.fn();
const findFirst = jest.fn();
const create = jest.fn();
const update = jest.fn();
const count = jest.fn();

const tFindUnique = jest.fn(); // tenant
const gFindUnique = jest.fn(); // group
const uFindMany = jest.fn(); // users (guardians)
const guardianRelationshipFindFirst = jest.fn();
const snapshotFindFirst = jest.fn();
const subscriptionFindFirst = jest.fn();

jest.mock("@pathway/db", () => ({
  prisma: {
    child: { findMany, findFirst, create, update, count },
    tenant: { findUnique: tFindUnique },
    group: { findUnique: gFindUnique },
    user: { findMany: uFindMany },
    guardianChildRelationship: { findFirst: guardianRelationshipFindFirst },
    orgEntitlementSnapshot: { findFirst: snapshotFindFirst },
    subscription: { findFirst: subscriptionFindFirst },
    $disconnect: jest.fn(),
  },
}));

const mockStorage = {
  downloadObject: jest.fn(),
  isConfigured: jest.fn(),
  uploadObject: jest.fn(),
};

import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ChildrenService } from "../../children/children.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";

describe("ChildrenService", () => {
  let svc: ChildrenService;
  const tenantId = "t1";

  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.isConfigured.mockReturnValue(false);
    mockStorage.uploadObject.mockResolvedValue(null);
    svc = new ChildrenService(mockStorage as unknown as SupabaseStorageService);
    snapshotFindFirst.mockResolvedValue(null);
    subscriptionFindFirst.mockResolvedValue({ planCode: "STARTER_MONTHLY" });
    count.mockResolvedValue(10);
  });

  it("requires an active, reviewed relationship for guardian child detail access", async () => {
    guardianRelationshipFindFirst.mockResolvedValueOnce(null);
    await expect(
      svc.assertCanViewChild("child-a", tenantId, "guardian-a", false),
    ).rejects.toBeInstanceOf(NotFoundException);
    guardianRelationshipFindFirst.mockResolvedValueOnce({
      id: "relationship-a",
    });
    await expect(
      svc.assertCanViewChild("child-a", tenantId, "guardian-a", false),
    ).resolves.toBeUndefined();
    expect(guardianRelationshipFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId,
          childId: "child-a",
          legalAccess: "FULL",
          revokedAt: null,
        }),
      }),
    );
  });

  describe("list", () => {
    it("returns children by tenant", async () => {
      findMany.mockResolvedValueOnce([]);
      const res = await svc.list(tenantId);
      expect(res).toEqual([]);
      expect(findMany).toHaveBeenCalledWith({
        where: { tenantId, OR: expect.any(Array) },
        select: expect.any(Object),
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
    });

    it("excludes children whose guest pass has expired", async () => {
      findMany.mockResolvedValueOnce([]);
      await svc.list(tenantId);
      const where = findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { isGuest: false },
        { guestExpiresAt: { gt: expect.any(Date) } },
      ]);
    });
  });

  describe("getById", () => {
    it("returns child when found in tenant", async () => {
      const child = { id: "c1", tenantId };
      findFirst.mockResolvedValueOnce(child);
      const res = await svc.getById("c1", tenantId);
      expect(res).toBe(child);
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "c1", tenantId, OR: expect.any(Array) },
        select: expect.any(Object),
      });
    });

    it("includes contact-only guardian records for child detail views", async () => {
      const child = {
        id: "c1",
        tenantId,
        guardianContacts: [
          {
            id: "contact-1",
            fullName: "Jane Doe",
            email: "jane@example.com",
            phone: "07700900111",
            relationshipToChild: "Parent",
            contactType: "PRIMARY_GUARDIAN",
          },
        ],
      };
      findFirst.mockResolvedValueOnce(child);

      const res = await svc.getById("c1", tenantId);

      expect(res).toBe(child);
      expect(findFirst).toHaveBeenCalledWith({
        where: { id: "c1", tenantId, OR: expect.any(Array) },
        select: expect.objectContaining({
          guardianContacts: expect.any(Object),
        }),
      });
    });

    it("404 when missing", async () => {
      findFirst.mockResolvedValueOnce(null);
      await expect(svc.getById("missing", tenantId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("getPhoto", () => {
    it("returns photo when consent and photoBytes", async () => {
      const buf = Buffer.from("fake-image-data");
      findFirst.mockResolvedValueOnce({
        photoConsent: true,
        photoBytes: buf,
        photoContentType: "image/jpeg",
        photoKey: null,
      });
      const res = await svc.getPhoto("c1", tenantId);
      expect(res).not.toBeNull();
      expect(res?.buffer).toEqual(buf);
      expect(res?.contentType).toBe("image/jpeg");
    });

    it("returns internal profile photo when organisation photo consent is false", async () => {
      const buf = Buffer.from("fake-image-data");
      findFirst.mockResolvedValueOnce({
        photoConsent: false,
        photoBytes: buf,
        photoContentType: "image/jpeg",
        photoKey: null,
      });
      const res = await svc.getPhoto("c1", tenantId);
      expect(res).not.toBeNull();
      expect(res?.buffer).toEqual(buf);
      expect(res?.contentType).toBe("image/jpeg");
    });

    it("returns null when no photo bytes", async () => {
      findFirst.mockResolvedValueOnce({
        photoConsent: true,
        photoBytes: null,
        photoContentType: null,
        photoKey: null,
      });
      const res = await svc.getPhoto("c1", tenantId);
      expect(res).toBeNull();
    });
  });

  describe("create", () => {
    const baseDto = {
      firstName: "Jess",
      lastName: "Doe",
      allergies: "peanuts",
    } as any;

    it("creates after validations", async () => {
      tFindUnique.mockResolvedValueOnce({ id: tenantId, orgId: "org_1" });
      gFindUnique.mockResolvedValueOnce({ id: "g1", tenantId });
      uFindMany.mockResolvedValueOnce([]);
      create.mockResolvedValueOnce({ id: "c1", tenantId });

      const res = await svc.create({ ...baseDto }, tenantId);
      expect(res).toHaveProperty("id", "c1");
      expect(create).toHaveBeenCalled();
    });

    it("stores an internal profile photo without organisation photo consent", async () => {
      tFindUnique.mockResolvedValueOnce({ id: tenantId, orgId: "org_1" });
      create.mockResolvedValueOnce({ id: "c1", tenantId });

      const photoBase64 = Buffer.from("fake-image-data").toString("base64");
      await svc.create(
        {
          ...baseDto,
          photoConsent: false,
          photoBase64,
          photoContentType: "image/jpeg",
        },
        tenantId,
      );

      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            photoConsent: false,
            photoBytes: expect.any(Buffer),
            photoContentType: "image/jpeg",
          }),
        }),
      );
    });

    it("errors when tenant missing", async () => {
      await expect(
        svc.create({ ...baseDto }, undefined as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("blocks create when children cap is reached", async () => {
      tFindUnique.mockResolvedValueOnce({ id: tenantId, orgId: "org_1" });
      snapshotFindFirst.mockResolvedValueOnce({
        flagsJson: { maxChildrenIncluded: 50 },
      });
      count.mockResolvedValueOnce(50);

      await expect(svc.create({ ...baseDto }, tenantId)).rejects.toThrow(
        /children cap reached/i,
      );
      expect(subscriptionFindFirst).toHaveBeenCalledWith({
        where: {
          orgId: "org_1",
          planCode: { not: { startsWith: "ADD_ON:" } },
        },
        orderBy: [{ periodEnd: "desc" }],
        select: { planCode: true },
      });
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates when child exists in tenant", async () => {
      findFirst.mockResolvedValueOnce({ id: "c1", tenantId });
      gFindUnique.mockResolvedValueOnce({ id: "g1", tenantId });
      update.mockResolvedValueOnce({ id: "c1", tenantId, groupId: "g1" });

      const res = await svc.update("c1", { groupId: "g1" } as any, tenantId);
      expect(res).toHaveProperty("groupId", "g1");
      expect(update).toHaveBeenCalled();
    });

    it("404 when child not in tenant", async () => {
      findFirst.mockResolvedValueOnce(null);
      await expect(svc.update("missing", {}, tenantId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("uploadPhoto", () => {
    it("uploads an internal profile photo without organisation photo consent", async () => {
      findFirst.mockResolvedValueOnce({ id: "c1" });
      update.mockResolvedValueOnce({ id: "c1" });

      await expect(
        svc.uploadPhoto(
          "c1",
          tenantId,
          "u1",
          true,
          Buffer.from("fake-image-data").toString("base64"),
          "image/jpeg",
        ),
      ).resolves.toBeUndefined();

      expect(update).toHaveBeenCalledWith({
        where: { id: "c1" },
        data: {
          photoBytes: expect.any(Buffer),
          photoContentType: "image/jpeg",
          photoKey: null,
        },
      });
    });
  });
});
