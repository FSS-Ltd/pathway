/* eslint-disable no-var */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ConcernsService } from "../concerns.service";
import type { AuditService } from "../../audit/audit.service";

// Types used in tests
interface Concern {
  id: string;
  childId: string;
  summary: string;
  details: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

// Prisma mocks (single-argument wrappers to avoid TS tuple spread issues)
var childFindFirst: jest.Mock<Promise<{ id: string } | null>, [unknown]>;
var concernCreate: jest.Mock<Promise<Concern>, [unknown]>;
var concernUpdate: jest.Mock<Promise<Concern>, [unknown]>;
var concernFindFirst: jest.Mock<Promise<Concern | null>, [unknown]>;
var concernFindMany: jest.Mock<Promise<Concern[]>, [unknown]>;
var concernCount: jest.Mock<Promise<number>, [unknown]>;

jest.mock("@pathway/db", () => {
  childFindFirst = jest.fn();
  concernCreate = jest.fn();
  concernUpdate = jest.fn();
  concernFindFirst = jest.fn();
  concernFindMany = jest.fn();
  concernCount = jest.fn().mockResolvedValue(0);

  const tx = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    child: { findFirst: childFindFirst },
    concern: {
      create: concernCreate,
      update: concernUpdate,
      findFirst: concernFindFirst,
      findMany: concernFindMany,
      count: concernCount,
    },
  };

  return {
    prisma: tx,
    withTenantRlsContext: (
      _tenantId: string,
      _orgId: string | null,
      cb: (client: typeof tx) => Promise<unknown>,
    ) => cb(tx),
  };
});

describe("ConcernsService", () => {
  let service: ConcernsService;
  const tenantId = "33333333-3333-3333-3333-333333333333";
  const orgId = "44444444-4444-4444-4444-444444444444";
  const actorUserId = "55555555-5555-5555-5555-555555555555";
  const context = { tenantId, orgId, actorUserId };
  const auditStub: Pick<AuditService, "recordEvent"> = {
    recordEvent: jest.fn().mockResolvedValue(undefined),
  };
  const childId = "11111111-1111-1111-1111-111111111111";
  const concernId = "22222222-2222-2222-2222-222222222222";

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ConcernsService(auditStub as AuditService);
  });

  describe("create", () => {
    it("creates a concern when child exists", async () => {
      childFindFirst.mockResolvedValue({ id: childId });
      const created: Concern = {
        id: concernId,
        childId,
        summary: "Behavioural issue",
        details: "Talked during class",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      concernCreate.mockResolvedValue(created);

      const res = await service.create(
        {
          childId,
          summary: "Behavioural issue",
          details: "Talked during class",
        },
        context,
      );
      expect(childFindFirst).toHaveBeenCalledWith({
        where: { id: childId, tenantId },
        select: { id: true },
      });
      expect(concernCreate).toHaveBeenCalled();
      expect(res).toEqual(created);
      expect(auditStub.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.any(String),
          entityId: concernId,
        }),
      );
    });

    it("throws NotFound when child missing", async () => {
      childFindFirst.mockResolvedValue(null);
      await expect(
        service.create({ childId, summary: "x" }, context),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(concernCreate).not.toHaveBeenCalled();
    });

    it("maps Prisma FK error to BadRequest", async () => {
      childFindFirst.mockResolvedValue({ id: childId });
      concernCreate.mockRejectedValue({ code: "P2003", message: "fk" });
      await expect(
        service.create({ childId, summary: "x" }, context),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("withContext tenant guard", () => {
    const noTenantContext = { tenantId: "", orgId, actorUserId };

    it("rejects findAll with BadRequest when tenantId is missing, without touching the db", async () => {
      await expect(
        service.findAll({}, noTenantContext),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(concernFindMany).not.toHaveBeenCalled();
    });

    it("rejects create with BadRequest when tenantId is missing, without touching the db", async () => {
      await expect(
        service.create({ childId, summary: "x" }, noTenantContext),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(childFindFirst).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("passes filters to prisma and returns list", async () => {
      const items: Concern[] = [
        {
          id: concernId,
          childId,
          summary: "s",
          details: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];
      concernFindMany.mockResolvedValue(items);
      const res = await service.findAll({ childId }, context);
      expect(concernFindMany).toHaveBeenCalled();
      expect(Array.isArray(res)).toBe(true);
      expect(res[0].childId).toBe(childId);
      expect(concernFindMany).toHaveBeenCalledWith({
        where: {
          child: { tenantId },
          childId,
          deletedAt: null,
        },
        orderBy: { createdAt: "desc" },
        include: {
          child: { select: { firstName: true, lastName: true } },
        },
      });
    });
  });

  describe("findOne", () => {
    it("returns concern when found", async () => {
      const item: Concern = {
        id: concernId,
        childId,
        summary: "s",
        details: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      concernFindFirst.mockResolvedValue(item);
      const res = await service.findOne(concernId, context);
      expect(res).toEqual(item);
    });

    it("throws NotFound when missing", async () => {
      concernFindFirst.mockResolvedValue(null);
      await expect(service.findOne(concernId, context)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("update", () => {
    it("updates and returns concern", async () => {
      const updated: Concern = {
        id: concernId,
        childId,
        summary: "updated",
        details: "d",
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };
      concernFindFirst.mockResolvedValue(updated);
      concernUpdate.mockResolvedValue(updated);
      const res = await service.update(
        concernId,
        {
          summary: "updated",
          details: "d",
        },
        context,
      );
      expect(concernUpdate).toHaveBeenCalled();
      expect(res).toEqual(updated);
      expect(auditStub.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.any(String),
          entityId: concernId,
        }),
      );
    });

    it("maps P2025 to NotFound on update", async () => {
      concernFindFirst.mockResolvedValue({
        id: concernId,
        childId,
        summary: "s",
        details: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      concernUpdate.mockRejectedValue({ code: "P2025", message: "not found" });
      await expect(
        service.update(concernId, { summary: "x" }, context),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("deletes by id and returns payload", async () => {
      const deleted: Concern = {
        id: concernId,
        childId,
        summary: "s",
        details: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: new Date(),
      };
      concernFindFirst.mockResolvedValue({
        id: concernId,
        childId,
        summary: "s",
        details: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      concernUpdate.mockResolvedValue(deleted);
      const res = await service.remove(concernId, context);
      expect(res).toEqual({
        id: concernId,
        deletedAt: deleted.deletedAt,
      });
      expect(auditStub.recordEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          action: expect.any(String),
          entityId: concernId,
        }),
      );
    });

    it("maps P2025 to NotFound on delete", async () => {
      concernFindFirst.mockResolvedValue({
        id: concernId,
        childId,
        summary: "s",
        details: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      concernUpdate.mockRejectedValue({ code: "P2025", message: "not found" });
      await expect(service.remove(concernId, context)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("maps P2003 to BadRequest on delete", async () => {
      concernFindFirst.mockResolvedValue({
        id: concernId,
        childId,
        summary: "s",
        details: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });
      concernUpdate.mockRejectedValue({ code: "P2003", message: "fk" });
      await expect(service.remove(concernId, context)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });
  });
});
