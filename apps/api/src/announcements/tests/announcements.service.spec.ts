import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AnnouncementsService, type Audience } from "../announcements.service";

// ---- Types used in tests
type Announcement = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  audience: Audience;
  publishedAt: Date | null;
};

// ---- Prisma mocks
const tenantFindUnique = jest.fn<Promise<{ id: string } | null>, [unknown]>();
const announcementCreate = jest.fn<Promise<Announcement>, [unknown]>();
const announcementUpdate = jest.fn<Promise<Announcement>, [unknown]>();
const announcementDelete = jest.fn<Promise<{ id: string }>, [unknown]>();
const announcementFindFirst = jest.fn<
  Promise<Announcement | null>,
  [unknown]
>();
const announcementFindMany = jest.fn<Promise<Announcement[]>, [unknown]>();

jest.mock("@pathway/db", () => ({
  prisma: {
    tenant: { findUnique: (arg: unknown) => tenantFindUnique(arg) },
    announcement: {
      create: (arg: unknown) => announcementCreate(arg),
      update: (arg: unknown) => announcementUpdate(arg),
      delete: (arg: unknown) => announcementDelete(arg),
      findFirst: (arg: unknown) => announcementFindFirst(arg),
      findMany: (arg: unknown) => announcementFindMany(arg),
    },
  },
}));

describe("AnnouncementsService", () => {
  let service: AnnouncementsService;
  const tenantId = "11111111-1111-1111-1111-111111111111";
  const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
  const baseAnnouncement: Announcement = {
    id,
    tenantId,
    title: "Welcome",
    body: "We are live!",
    audience: "ALL",
    publishedAt: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AnnouncementsService();
  });

  describe("create", () => {
    it("creates an announcement (valid tenant)", async () => {
      tenantFindUnique.mockResolvedValue({ id: tenantId });
      announcementCreate.mockResolvedValue(baseAnnouncement);

      const res = await service.create(
        {
          tenantId,
          title: "Welcome",
          body: "We are live!",
          audience: "ALL",
        },
        tenantId,
      );

      expect(tenantFindUnique).toHaveBeenCalledWith({
        where: { id: tenantId },
        select: { id: true },
      });
      expect(announcementCreate).toHaveBeenCalled();
      expect(res).toEqual(baseAnnouncement);
    });

    it("throws NotFound when tenant missing", async () => {
      tenantFindUnique.mockResolvedValue(null);
      await expect(
        service.create(
          { tenantId, title: "t", body: "b", audience: "ALL" },
          tenantId,
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(announcementCreate).not.toHaveBeenCalled();
    });

    it("maps Prisma FK error to BadRequest", async () => {
      tenantFindUnique.mockResolvedValue({ id: tenantId });
      announcementCreate.mockRejectedValue({ code: "P2003", message: "fk" });
      await expect(
        service.create(
          { tenantId, title: "t", body: "b", audience: "ALL" },
          tenantId,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("findAll", () => {
    it("passes filters to prisma and returns list", async () => {
      const items: Announcement[] = [
        {
          id,
          tenantId,
          title: "Msg",
          body: "hello",
          audience: "PARENTS",
          publishedAt: new Date("2025-01-10T00:00:00.000Z"),
        },
      ];
      announcementFindMany.mockResolvedValue(items);

      const res = await service.findAll({
        tenantId,
        audience: "PARENTS",
        publishedOnly: true,
      });
      expect(announcementFindMany).toHaveBeenCalledWith({
        where: {
          tenantId,
          audience: "PARENTS",
          publishedAt: { not: null },
        },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      });
      expect(Array.isArray(res)).toBe(true);
      expect(res[0].audience).toBe("PARENTS");
    });
  });

  describe("findOne", () => {
    it("returns item when found", async () => {
      announcementFindFirst.mockResolvedValue(baseAnnouncement);
      const res = await service.findOne(id, tenantId);
      expect(res).toEqual(baseAnnouncement);
      expect(announcementFindFirst).toHaveBeenCalledWith({
        where: { id, tenantId },
      });
    });

    it("throws NotFound when missing", async () => {
      announcementFindFirst.mockResolvedValue(null);
      await expect(service.findOne(id, tenantId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("updates and returns announcement", async () => {
      announcementFindFirst.mockResolvedValue(baseAnnouncement);
      const updated: Announcement = {
        ...baseAnnouncement,
        title: "Updated",
        audience: "STAFF",
      };
      announcementUpdate.mockResolvedValue(updated);
      const res = await service.update(
        id,
        {
          title: "Updated",
          audience: "STAFF",
        },
        tenantId,
      );
      expect(announcementFindFirst).toHaveBeenCalledWith({
        where: { id, tenantId },
        select: { id: true },
      });
      expect(announcementUpdate).toHaveBeenCalledWith({
        where: { id },
        data: {
          title: "Updated",
          audience: "STAFF",
          body: undefined,
          publishedAt: undefined,
        },
      });
      expect(res).toEqual(updated);
    });

    it("maps P2025 to NotFound", async () => {
      announcementFindFirst.mockResolvedValue(baseAnnouncement);
      announcementUpdate.mockRejectedValue({
        code: "P2025",
        message: "not found",
      });
      await expect(
        service.update(id, { title: "Updated" }, tenantId),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("deletes by id and returns payload", async () => {
      const deleted: { id: string } = { id };
      announcementFindFirst.mockResolvedValue(baseAnnouncement);
      announcementDelete.mockResolvedValue(deleted);
      const res = await service.remove(id, tenantId);
      expect(announcementFindFirst).toHaveBeenCalledWith({
        where: { id, tenantId },
        select: { id: true },
      });
      expect(res).toEqual(deleted);
    });

    it("maps P2025 to NotFound on delete", async () => {
      announcementFindFirst.mockResolvedValue(baseAnnouncement);
      announcementDelete.mockRejectedValue({
        code: "P2025",
        message: "not found",
      });
      await expect(service.remove(id, tenantId)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("maps P2003 to BadRequest on delete", async () => {
      announcementFindFirst.mockResolvedValue(baseAnnouncement);
      announcementDelete.mockRejectedValue({ code: "P2003", message: "fk" });
      await expect(service.remove(id, tenantId)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
