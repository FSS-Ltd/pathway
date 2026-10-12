import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { AttendanceService } from "../attendance.service";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { PathwayRequestContext, UserTenantRole } from "@pathway/auth";
import { Av30ActivityService } from "../../av30/av30-activity.service";
import type { AuthContext } from "@pathway/auth/src/types/auth-context";
import type { Request } from "express";
import { createAttendanceDto } from "../dto/create-attendance.dto";
import { updateAttendanceDto } from "../dto/update-attendance.dto";
import { upsertSessionAttendanceDto } from "../dto/upsert-session-attendance.dto";

jest.mock("@pathway/db", () => {
  const actual =
    jest.requireActual<typeof import("@pathway/db")>("@pathway/db");
  const transactionClient = new Proxy(actual.prisma, {
    get(target, property, receiver) {
      if (property === "$queryRaw") return jest.fn().mockResolvedValue([]);
      return Reflect.get(target, property, receiver);
    },
  });
  return {
    ...actual,
    withTenantRlsContext: jest.fn(
      async (
        _tenantId: string,
        _orgId: string | null,
        callback: Parameters<typeof actual.withTenantRlsContext>[2],
      ) => callback(transactionClient),
    ),
  };
});

// --- Prisma mocks
const aFindMany = jest.spyOn(prisma.attendance, "findMany");
const aFindFirst = jest.spyOn(prisma.attendance, "findFirst");
const aCreate = jest.spyOn(prisma.attendance, "create");
const aUpdate = jest.spyOn(prisma.attendance, "update");
const eventCreate = jest.spyOn(prisma.attendanceCorrectionEvent, "create");

const cFindUnique = jest.spyOn(prisma.child, "findUnique");
const cFindMany = jest.spyOn(prisma.child, "findMany");
const gFindUnique = jest.spyOn(prisma.group, "findUnique");
const sFindFirst = jest.spyOn(prisma.session, "findFirst");

const attendanceSelect = {
  id: true,
  childId: true,
  groupId: true,
  present: true,
  status: true,
  sessionId: true,
  timestamp: true,
  correctedAt: true,
  correctedByUserId: true,
  correctionReason: true,
} as const;

describe("AttendanceService", () => {
  let svc: AttendanceService;
  let mockAv30Service: Av30ActivityService;
  let mockRequestContext: PathwayRequestContext;

  const createMockContext = (): PathwayRequestContext => {
    const context: AuthContext = {
      user: {
        userId: "user-123",
        email: "staff@example.com",
        authProvider: "auth0",
      },
      org: {
        orgId: "org-123",
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
    eventCreate.mockReset();
    eventCreate.mockResolvedValue({
      id: "event-1",
      tenantId: "tenant-123",
      childId: "c1",
      attendanceId: "attendance-1",
      previousStatus: "ABSENT",
      newStatus: "LATE",
      reason: "Correction",
      correctedByUserId: "user-123",
      correctedAt: new Date(),
      origin: "LIVE",
    });
    cFindUnique.mockReset();
    cFindMany.mockReset();
    gFindUnique.mockReset();
    sFindFirst.mockReset();

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
        select: attendanceSelect,
        orderBy: [{ timestamp: "desc" }],
      });
    });

    it.each([
      [true, "PRESENT"],
      [false, "ABSENT"],
    ] as const)(
      "maps legacy present=%s rows to %s while preserving the Boolean read",
      async (present, status) => {
        aFindMany.mockResolvedValueOnce([
          {
            id: `att-${status}`,
            childId: "c1",
            groupId: "g1",
            sessionId: null,
            present,
            status: null,
            timestamp: new Date("2026-08-12T09:00:00.000Z"),
            correctedAt: null,
            correctedByUserId: null,
            correctionReason: null,
          },
        ] as unknown as Awaited<ReturnType<typeof prisma.attendance.findMany>>);

        await expect(svc.list("t1")).resolves.toEqual([
          expect.objectContaining({ present, status }),
        ]);
      },
    );
  });

  describe("DTO compatibility", () => {
    const childId = "11111111-1111-1111-1111-111111111111";
    const otherChildId = "33333333-3333-3333-3333-333333333333";
    const groupId = "22222222-2222-2222-2222-222222222222";

    it("accepts either the legacy Boolean or a status when creating", () => {
      expect(
        createAttendanceDto.safeParse({ childId, groupId, present: false })
          .success,
      ).toBe(true);
      expect(
        createAttendanceDto.safeParse({ childId, groupId, status: "LATE" })
          .success,
      ).toBe(true);
      expect(
        createAttendanceDto.safeParse({
          childId,
          groupId,
          status: "LATE",
          present: false,
        }).success,
      ).toBe(false);
      expect(createAttendanceDto.safeParse({ childId, groupId }).success).toBe(
        false,
      );
    });

    it("accepts and trims correction reasons for status updates", () => {
      expect(
        updateAttendanceDto.parse({
          status: "ABSENT",
          correctionReason: "  Parent confirmed absence  ",
        }),
      ).toEqual({
        status: "ABSENT",
        correctionReason: "Parent confirmed absence",
      });
      expect(
        updateAttendanceDto.safeParse({
          status: "ABSENT",
          correctionReason: "   ",
        }).success,
      ).toBe(false);
    });

    it("accepts new and legacy session-upsert rows", () => {
      expect(
        upsertSessionAttendanceDto.safeParse({
          rows: [
            { childId, status: "LATE" },
            { childId: otherChildId, present: true },
          ],
        }).success,
      ).toBe(true);
    });

    it("rejects duplicate child rows before a session upsert", () => {
      expect(
        upsertSessionAttendanceDto.safeParse({
          rows: [
            { childId, status: "LATE" },
            { childId, status: "ABSENT" },
          ],
        }).success,
      ).toBe(false);
    });
  });

  describe("getById", () => {
    it("returns a record when found", async () => {
      const row = {
        id: "att1",
        childId: "c1",
        groupId: "g1",
        present: true,
        status: "PRESENT" as const,
        timestamp: new Date(),
        sessionId: null,
        correctedAt: null,
        correctedByUserId: null,
        correctionReason: null,
      };
      aFindFirst.mockResolvedValueOnce(row);
      const res = await svc.getById("att1", "t1");
      expect(res).toEqual(row);
      expect(aFindFirst).toHaveBeenCalledWith({
        where: { id: "att1", child: { tenantId: "t1" } },
        select: attendanceSelect,
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
        status: "PRESENT",
        timestamp: new Date(),
        sessionId: null,
        correctedAt: null,
        correctedByUserId: null,
        correctionReason: null,
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
          status: "PRESENT",
          timestamp: expect.any(Date),
        },
        select: attendanceSelect,
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
        status: "ABSENT",
        timestamp: ts,
        sessionId: null,
        correctedAt: null,
        correctedByUserId: null,
        correctionReason: null,
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
          status: "ABSENT",
          timestamp: ts,
        },
        select: attendanceSelect,
      });
    });

    it("creates Late as the authoritative status and keeps legacy present true", async () => {
      cFindUnique.mockResolvedValueOnce({
        ...makeChild("t1"),
        id: childId,
      } as Awaited<ReturnType<typeof prisma.child.findUnique>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t1"),
        id: groupSame,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);
      aCreate.mockResolvedValueOnce({
        id: "att-late",
        childId,
        groupId: groupSame,
        present: true,
        status: "LATE",
        timestamp: new Date(),
        sessionId: null,
        correctedAt: null,
        correctedByUserId: null,
        correctionReason: null,
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.create>>);

      const res = await svc.create(
        {
          childId,
          groupId: groupSame,
          status: "LATE",
        } as unknown as Parameters<AttendanceService["create"]>[0],
        "t1",
      );

      expect(res).toMatchObject({ status: "LATE", present: true });
      expect(aCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "LATE", present: true }),
        }),
      );
    });
  });

  describe("update", () => {
    const id = "44444444-4444-4444-4444-444444444444";
    const newGroup = "55555555-5555-5555-5555-555555555555";

    it("throws NotFound if attendance missing", async () => {
      aFindFirst.mockResolvedValueOnce(null);
      await expect(
        svc.update(id, { present: false }, "tenant-123"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("accepts an idempotent legacy present write", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: false,
        status: "ABSENT",
        child: { tenantId: "tenant-123" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      aUpdate.mockResolvedValueOnce({
        id,
        childId: "c1",
        groupId: "g1",
        present: false,
        status: "ABSENT",
        timestamp: new Date(),
        sessionId: null,
        correctedAt: null,
        correctedByUserId: null,
        correctionReason: null,
      });

      const res = await svc.update(id, { present: false }, "tenant-123");
      expect(res.present).toBe(false);
      expect(aUpdate).toHaveBeenCalledWith({
        where: { id },
        data: {
          status: "ABSENT",
          present: false,
          timestamp: undefined,
          groupId: undefined,
          sessionId: undefined,
        },
        select: attendanceSelect,
      });
      expect(eventCreate).not.toHaveBeenCalled();
      // Verify AV30 activity was recorded
      expect(
        mockAv30Service.recordActivityForCurrentUser,
      ).toHaveBeenCalledTimes(1);
    });

    it("throws when changing group across tenants", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: true,
        status: "PRESENT",
        child: { tenantId: "tenant-123" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("t2"),
        id: newGroup,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);

      await expect(
        svc.update(id, { groupId: newGroup }, "tenant-123"),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("connects new group when same tenant", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: true,
        status: "PRESENT",
        child: { tenantId: "tenant-123" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      gFindUnique.mockResolvedValueOnce({
        ...makeGroup("tenant-123"),
        id: newGroup,
      } as Awaited<ReturnType<typeof prisma.group.findUnique>>);
      aUpdate.mockResolvedValueOnce({
        id,
        childId: "c1",
        groupId: newGroup,
        present: true,
        status: "PRESENT",
        timestamp: new Date(),
        sessionId: null,
        correctedAt: null,
        correctedByUserId: null,
        correctionReason: null,
      });

      await svc.update(id, { groupId: newGroup }, "tenant-123");
      expect(aUpdate).toHaveBeenCalledWith({
        where: { id },
        data: {
          status: undefined,
          present: undefined,
          timestamp: undefined,
          groupId: newGroup,
          sessionId: undefined,
        },
        select: attendanceSelect,
      });
    });

    it("requires a reason before changing an existing status", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: true,
        status: "PRESENT",
        child: { tenantId: "tenant-123" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);

      await expect(
        svc.update(
          id,
          { status: "LATE" } as unknown as Parameters<
            AttendanceService["update"]
          >[1],
          "tenant-123",
        ),
      ).rejects.toEqual(
        new BadRequestException(
          "correctionReason is required when changing attendance status",
        ),
      );
      expect(aUpdate).not.toHaveBeenCalled();
    });

    it("records correction provenance and keeps Late compatible with present=true", async () => {
      const correctedAt = new Date("2026-08-12T11:00:00.000Z");
      jest.useFakeTimers().setSystemTime(correctedAt);
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: false,
        status: "ABSENT",
        child: { tenantId: "tenant-123" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      aUpdate.mockResolvedValueOnce({
        id,
        childId: "c1",
        groupId: "g1",
        present: true,
        status: "LATE",
        timestamp: correctedAt,
        sessionId: null,
        correctedAt,
        correctedByUserId: "user-123",
        correctionReason: "Bus arrived late",
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.update>>);

      const result = await svc.update(
        id,
        {
          status: "LATE",
          correctionReason: "Bus arrived late",
        } as unknown as Parameters<AttendanceService["update"]>[1],
        "tenant-123",
      );

      expect(result).toMatchObject({ status: "LATE", present: true });
      expect(aUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "LATE",
            present: true,
            correctedAt,
            correctedByUserId: "user-123",
            correctionReason: "Bus arrived late",
          }),
        }),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: "tenant-123",
            attendanceId: id,
            previousStatus: "ABSENT",
            newStatus: "LATE",
            reason: "Bus arrived late",
            origin: "LIVE",
          }),
        }),
      );
      jest.useRealTimers();
    });

    it("rejects correction provenance from a different active site", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: false,
        status: "ABSENT",
        child: { tenantId: "tenant-other" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);

      await expect(
        svc.update(
          id,
          { status: "PRESENT", correctionReason: "Verified onsite" },
          "tenant-other",
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      expect(aUpdate).not.toHaveBeenCalled();
    });

    it("does not require or overwrite correction metadata for a no-op status write", async () => {
      aFindFirst.mockResolvedValueOnce({
        id,
        groupId: "g1",
        present: true,
        status: "LATE",
        child: { tenantId: "tenant-123" },
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.findFirst>>);
      aUpdate.mockResolvedValueOnce({
        id,
        childId: "c1",
        groupId: "g1",
        present: true,
        status: "LATE",
        timestamp: new Date(),
        sessionId: null,
        correctedAt: new Date("2026-08-11T10:00:00.000Z"),
        correctedByUserId: "earlier-user",
        correctionReason: "Earlier correction",
      } as unknown as Awaited<ReturnType<typeof prisma.attendance.update>>);

      await svc.update(
        id,
        { status: "LATE" } as unknown as Parameters<
          AttendanceService["update"]
        >[1],
        "tenant-123",
      );

      const updateCall = aUpdate.mock.calls[0]?.[0];
      expect(updateCall?.data).toMatchObject({ status: "LATE", present: true });
      expect(updateCall?.data).not.toHaveProperty("correctedAt");
      expect(updateCall?.data).not.toHaveProperty("correctedByUserId");
      expect(updateCall?.data).not.toHaveProperty("correctionReason");
      expect(eventCreate).not.toHaveBeenCalled();
    });
  });

  describe("upsertSessionAttendance", () => {
    it("requires per-row correction provenance and writes Late coherently", async () => {
      sFindFirst.mockResolvedValueOnce({
        id: "session-1",
        groups: [{ id: "group-1" }],
      } as unknown as Awaited<ReturnType<typeof prisma.session.findFirst>>);
      aFindMany.mockResolvedValueOnce([
        {
          id: "attendance-1",
          childId: "child-1",
          present: false,
          status: "ABSENT",
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.attendance.findMany>>);
      cFindMany.mockResolvedValueOnce([
        {
          id: "child-1",
          groupId: "group-1",
        },
      ] as Awaited<ReturnType<typeof prisma.child.findMany>>);
      aUpdate.mockResolvedValueOnce(
        {} as Awaited<ReturnType<typeof prisma.attendance.update>>,
      );
      sFindFirst.mockResolvedValueOnce({
        id: "session-1",
        title: "Session",
        startsAt: new Date(),
        endsAt: new Date(),
        groups: [{ id: "group-1", name: "Group" }],
      } as unknown as Awaited<ReturnType<typeof prisma.session.findFirst>>);
      cFindMany.mockResolvedValueOnce([]);
      aFindMany.mockResolvedValueOnce([]);

      await svc.upsertSessionAttendance("session-1", "tenant-123", {
        rows: [
          {
            childId: "child-1",
            status: "LATE",
            correctionReason: "Traffic delay",
          },
        ],
      } as unknown as Parameters<
        AttendanceService["upsertSessionAttendance"]
      >[2]);

      expect(aUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "LATE",
            present: true,
            correctedByUserId: "user-123",
            correctionReason: "Traffic delay",
          }),
        }),
      );
      expect(withTenantRlsContext).toHaveBeenCalledWith(
        "tenant-123",
        "org-123",
        expect.any(Function),
      );
      expect(eventCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            attendanceId: "attendance-1",
            previousStatus: "ABSENT",
            newStatus: "LATE",
            reason: "Traffic delay",
            origin: "LIVE",
          }),
        }),
      );
    });
  });
});
