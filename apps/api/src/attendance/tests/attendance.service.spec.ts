import { NotFoundException } from "@nestjs/common";
import { AttendanceService } from "../attendance.service";
import { prisma } from "@pathway/db";
import { PathwayRequestContext, UserTenantRole } from "@pathway/auth";
import { Av30ActivityService } from "../../av30/av30-activity.service";
import type { AuthContext } from "@pathway/auth/src/types/auth-context";
import type { Request } from "express";

// --- Prisma mocks
const aFindMany = jest.spyOn(prisma.attendance, "findMany");
const aFindFirst = jest.spyOn(prisma.attendance, "findFirst");
const aCreate = jest.spyOn(prisma.attendance, "create");
const aUpdate = jest.spyOn(prisma.attendance, "update");

const cFindUnique = jest.spyOn(prisma.child, "findUnique");
const gFindUnique = jest.spyOn(prisma.group, "findUnique");

describe("AttendanceService", () => {
  let svc: AttendanceService;
  let mockAv30Service: Av30ActivityService;
  let mockRequestContext: PathwayRequestContext;

  const createMockContext = (): PathwayRequestContext => {
    const context: AuthContext = {
      user: {
        userId: "user-123",
        email: "staff@example.com",
        authProvider: "debug",
      },
      org: {
        orgId: "org-123",
        auth0OrgId: "auth0|org123",
      },
      tenant: {
        tenantId: "tenant-123",
        orgId: "org-123",
      },
      roles: {
        org: [],
        tenant: [UserTenantRole.TEACHER],
      },
      permissions: [],
      rawClaims: {},
    };

    const mockRequest = {} as unknown as Request;
    const ctx = new PathwayRequestContext(mockRequest);
    ctx.setContext(context);
    return ctx;
  };

  const makeChild = (tenantId: string) => ({
    id: "" as string,
    groupId: null,
    firstName: "Test",
    lastName: "Child",
    preferredName: null,
    dateOfBirth: null,
    allergies: "none",
    additionalNeedsNotes: null,
    schoolName: null,
    yearGroup: null,
    gpName: null,
    gpPhone: null,
    specialNeedsType: null,
    specialNeedsOther: null,
    photoConsent: false,
    photoKey: null,
    photoBytes: null,
    photoContentType: null,
    notes: null,
    tenantId,
    disabilities: [],
    isGuest: false,
    guestExpiresAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const makeGroup = (tenantId: string) => ({
    id: "" as string,
    name: "Group A",
    tenantId,
    minAge: 3,
    maxAge: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    aFindMany.mockReset();
    aFindFirst.mockReset();
    aCreate.mockReset();
    aUpdate.mockReset();
    cFindUnique.mockReset();
    gFindUnique.mockReset();

    mockAv30Service = {
      recordActivityForCurrentUser: jest.fn().mockResolvedValue(undefined),
      recordActivity: jest.fn().mockResolvedValue(undefined),
    } as unknown as Av30ActivityService;

    mockRequestContext = createMockContext();

    svc = new AttendanceService(mockAv30Service, mockRequestContext);
  });

  describe("list", () => {
    it("returns attendance ordered by timestamp desc", async () => {
      aFindMany.mockResolvedValueOnce([]);
      const res = await svc.list("t1");
      expect(res).toEqual([]);
      expect(aFindMany).toHaveBeenCalledWith({
        where: { child: { tenantId: "t1" } },
        select: {
          id: true,
          childId: true,
          groupId: true,
          present: true,
          sessionId: true,
          timestamp: true,
        },
        orderBy: [{ timestamp: "desc" }],
      });
    });
  });

  describe("getById", () => {
    it("returns a record when found", async () => {
      const row = {
        id: "att1",
        childId: "c1",
        groupId: "g1",
        present: true,
        timestamp: new Date(),
        sessionId: null,
      };
      aFindFirst.mockResolvedValueOnce(row);
      const res = await svc.getById("att1", "t1");
      expect(res).toBe(row);
      expect(aFindFirst).toHaveBeenCalledWith({
        where: { id: "att1", child: { tenantId: "t1" } },
        select: {
          id: true,
          childId: true,
          groupId: true,
          present: true,
          sessionId: true,
          timestamp: true,
        },
      });
    });

    it("throws NotFound when missing", async () => {
      aFindFirst.mockResolvedValueOnce(null);
      await expect(svc.getById("missing", "t1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe("create", () => {
    const childId = "11111111-1111-1111-1111-111111111111";
    const groupSame = "22222222-2222-2222-2222-222222222222";
    const groupOther = "33333333-3333-3333-3333-333333333333";

    it("throws when child not found", async () => {
      cFindUnique.mockResolvedValueOnce(null);
      await expect(
        svc.create({ childId, groupId: groupSame, present: true }, "t1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws when group not found", async () => {
      cFindUnique.mockResolvedValueOnce({
        ...makeChild("t1"),
        id: childId,
      } as Awaited<ReturnType<typeof prisma.child.findUnique>>);
      gFindUnique.mockResolvedValueOnce(null);
      await expect(
        svc.create({ childId, groupId: groupSame, present: true }, "t1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("throws when child and group are in different tenants", async () => {
      cFindUnique.mockResolvedValueOnce({
        ...makeChild("t1"),
        id: childId,
      } as Awaited<ReturnType<typeof prisma.child.findUnique>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t2"),
        id: groupOther,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);
      await expect(
        svc.create({ childId, groupId: groupOther, present: true }, "t1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("creates with default timestamp when not provided", async () => {
      cFindUnique.mockResolvedValueOnce({
        ...makeChild("t1"),
        id: childId,
      } as Awaited<ReturnType<typeof prisma.child.findUnique>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t1"),
        id: groupSame,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);
      aCreate.mockResolvedValueOnce({
        id: "att1",
        childId,
        groupId: groupSame,
        present: true,
        timestamp: new Date(),
        sessionId: null,
      });

      const res = await svc.create(
        {
          childId,
          groupId: groupSame,
          present: true,
        },
        "t1",
      );
      expect(res).toMatchObject({
        id: "att1",
        childId,
        groupId: groupSame,
        present: true,
      });
      expect(aCreate).toHaveBeenCalledWith({
        data: {
          child: { connect: { id: childId } },
          group: { connect: { id: groupSame } },
          present: true,
          timestamp: expect.any(Date),
        },
        select: {
          id: true,
          childId: true,
          groupId: true,
          present: true,
          sessionId: true,
          timestamp: true,
        },
      });
      // Verify AV30 activity was recorded
      expect(
        mockAv30Service.recordActivityForCurrentUser,
      ).toHaveBeenCalledTimes(1);
    });

    it("creates with provided timestamp", async () => {
      const ts = new Date("2025-01-01T10:00:00.000Z");
      cFindUnique.mockResolvedValueOnce({
        ...makeChild("t1"),
        id: childId,
      } as Awaited<ReturnType<typeof prisma.child.findUnique>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t1"),
        id: groupSame,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);
      aCreate.mockResolvedValueOnce({
        id: "att2",
        childId,
        groupId: groupSame,
        present: false,
        timestamp: ts,
        sessionId: null,
      });

      const res = await svc.create(
        {
          childId,
          groupId: groupSame,
          present: false,
          timestamp: ts,
        },
        "t1",
      );
      expect(res.timestamp).toEqual(ts);
      expect(aCreate).toHaveBeenCalledWith({
        data: {
          child: { connect: { id: childId } },
          group: { connect: { id: groupSame } },
          present: false,
          timestamp: ts,
        },
        select: {
          id: true,
          childId: true,
          groupId: true,
          present: true,
          sessionId: true,
          timestamp: true,
        },
      });
    });
  });

  describe("update", () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const newGroup = "55555555-5555-5555-5555-555555555555";

    it("throws NotFound if attendance missing", async () => {
      aFindFirst.mockResolvedValueOnce(null);
      await expect(
        svc.update(id, { present: false }, "t1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("updates present only", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        child: { tenantId: "t1" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      aUpdate.mockResolvedValueOnce({
        id,
        childId: "c1",
        groupId: "g1",
        present: false,
        timestamp: new Date(),
        sessionId: null,
      });

      const res = await svc.update(id, { present: false }, "t1");
      expect(res.present).toBe(false);
      expect(aUpdate).toHaveBeenCalledWith({
        where: { id },
        data: { present: false, timestamp: undefined },
        select: {
          id: true,
          childId: true,
          groupId: true,
          present: true,
          sessionId: true,
          timestamp: true,
        },
      });
      // Verify AV30 activity was recorded
      expect(
        mockAv30Service.recordActivityForCurrentUser,
      ).toHaveBeenCalledTimes(1);
    });

    it("throws when changing group across tenants", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        child: { tenantId: "t1" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t2"),
        id: newGroup,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);

      await expect(
        svc.update(id, { groupId: newGroup }, "t1"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("connects new group when same tenant", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        child: { tenantId: "t1" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t1"),
        id: newGroup,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);
      aUpdate.mockResolvedValueOnce({
        id,
        childId: "c1",
        groupId: newGroup,
        present: true,
        timestamp: new Date(),
        sessionId: null,
      });

      await svc.update(id, { groupId: newGroup }, "t1");
      expect(aUpdate).toHaveBeenCalledWith({
        where: { id },
        data: {
          present: undefined,
          timestamp: undefined,
          group: { connect: { id: newGroup } },
        },
        select: {
          id: true,
          childId: true,
          groupId: true,
          present: true,
          sessionId: true,
          timestamp: true,
        },
      });
    });
  });
});
