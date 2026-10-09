import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { SessionsController } from "../sessions.controller";
import { SessionsService } from "../sessions.service";
import { StaffAttendanceService } from "../staff-attendance.service";
import { CreateSessionDto } from "../dto/create-session.dto";
import { UpdateSessionDto } from "../dto/update-session.dto";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { EntitlementsEnforcementService } from "../../billing/entitlements-enforcement.service";
import { RotaAccessService } from "../rota-access.service";
import { FamilyTimetableService } from "../family-timetable.service";

// Minimal shape used in tests (avoid importing Prisma types here)
type LessonShape = {
  id: string;
  title: string;
  description: string | null;
  resourceFileName: string | null;
  fileKey: string | null;
};

interface SessionShape {
  id: string;
  tenantId: string;
  startsAt: Date;
  endsAt: Date;
  title: string | null;
  familyPublishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  groups: { id: string; name: string }[];
  lessons: LessonShape[];
  attendanceMarked: number;
  attendanceTotal: number;
}

describe("SessionsController", () => {
  let controller: SessionsController;

  const tenantId = "t1";
  const orgId = "org-123";
  const managerRequest = { authUserId: "manager-1" } as Parameters<
    SessionsController["list"]
  >[3];
  const staffRequest = { authUserId: "staff-1" } as typeof managerRequest;
  const baseSession: SessionShape = {
    id: "sess-1",
    tenantId,
    startsAt: new Date("2025-01-01T09:00:00Z"),
    endsAt: new Date("2025-01-01T10:00:00Z"),
    title: "Kids service",
    familyPublishedAt: null,
    createdAt: new Date("2024-12-31T00:00:00Z"),
    updatedAt: new Date("2024-12-31T00:00:00Z"),
    groups: [{ id: "g1", name: "Kids" }],
    lessons: [],
    attendanceMarked: 0,
    attendanceTotal: 0,
  };

  const staffUserId = "22222222-2222-2222-2222-222222222222";
  const staffAttendanceRoster = [
    {
      staffUserId,
      displayName: "Staff One",
      roleLabel: "Lead",
      assigned: true,
      attendanceStatus: "PRESENT" as const,
    },
  ];

  const staffAttendanceMock: jest.Mocked<
    Pick<StaffAttendanceService, "getRoster" | "upsert">
  > = {
    getRoster: jest.fn().mockResolvedValue(staffAttendanceRoster),
    upsert: jest.fn().mockResolvedValue(staffAttendanceRoster),
  };

  const serviceMock = {
    list: jest.fn<Promise<SessionShape[]>, [SessionListFilters]>(),
    getById: jest.fn<Promise<SessionShape>, [string, string]>(),
    create: jest.fn<Promise<SessionShape>, [CreateSessionDto, string]>(),
    update: jest.fn<
      Promise<SessionShape>,
      [string, UpdateSessionDto, string]
    >(),
  } as jest.Mocked<
    Pick<SessionsService, "list" | "getById" | "create" | "update">
  >;

  type SessionListFilters = Parameters<SessionsService["list"]>[0];

  const enforcementMock: jest.Mocked<
    Pick<
      EntitlementsEnforcementService,
      "checkAv30ForOrg" | "assertWithinHardCap"
    >
  > = {
    checkAv30ForOrg: jest.fn().mockResolvedValue({
      orgId,
      currentAv30: 10,
      av30Cap: 100,
      status: "OK",
      graceUntil: null,
      messageCode: "av30.ok",
    }),
    assertWithinHardCap: jest.fn(),
  };

  const rotaAccess = {
    canManage: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    assertManager: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    assertSessionVisible: jest
      .fn<Promise<void>, []>()
      .mockResolvedValue(undefined),
  };
  const familyTimetable = { setPublication: jest.fn() };

  beforeEach(async () => {
    jest.resetAllMocks();
    staffAttendanceMock.getRoster.mockResolvedValue(staffAttendanceRoster);
    staffAttendanceMock.upsert.mockResolvedValue(staffAttendanceRoster);
    rotaAccess.canManage.mockResolvedValue(true);
    rotaAccess.assertManager.mockResolvedValue(undefined);
    rotaAccess.assertSessionVisible.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SessionsController],
      providers: [
        { provide: SessionsService, useValue: serviceMock },
        { provide: StaffAttendanceService, useValue: staffAttendanceMock },
        { provide: RotaAccessService, useValue: rotaAccess },
        { provide: FamilyTimetableService, useValue: familyTimetable },
        {
          provide: EntitlementsEnforcementService,
          useValue: enforcementMock,
        },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SessionsController>(SessionsController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("list should return array", async () => {
    serviceMock.list.mockResolvedValueOnce([baseSession]);
    const res = await controller.list({}, tenantId, orgId, managerRequest);
    expect(Array.isArray(res)).toBe(true);
    expect(res[0].id).toBe(baseSession.id);
    expect(serviceMock.list).toHaveBeenCalledWith({
      tenantId,
      staffUserId: undefined,
      groupId: undefined,
      from: undefined,
      to: undefined,
    });
  });

  it("byId should return a session", async () => {
    serviceMock.getById.mockResolvedValueOnce(baseSession);
    const res = await controller.getById(
      baseSession.id,
      tenantId,
      orgId,
      managerRequest,
    );
    expect(res).toMatchObject({ id: baseSession.id });
    expect(serviceMock.getById).toHaveBeenCalledWith(baseSession.id, tenantId);
  });

  it("create should call service and return session", async () => {
    const dto: CreateSessionDto = {
      tenantId,
      groupId: "g1",
      startsAt: new Date("2025-01-01T09:00:00Z"),
      endsAt: new Date("2025-01-01T10:00:00Z"),
      title: "Kids service",
    };
    serviceMock.create.mockResolvedValueOnce(baseSession);
    const res = await controller.create(dto, tenantId, orgId, managerRequest);
    expect(res).toEqual(baseSession);
    expect(serviceMock.create).toHaveBeenCalledWith(dto, tenantId);
  });

  it("create should 400 when endsAt <= startsAt (DTO validation)", async () => {
    const bad: CreateSessionDto = {
      tenantId,
      groupId: "g1",
      startsAt: new Date("2025-01-01T10:00:00Z"),
      endsAt: new Date("2025-01-01T09:00:00Z"),
      title: "Bad times",
    };

    await expect(
      controller.create(bad, tenantId, orgId, managerRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceMock.create).not.toHaveBeenCalled();
  });

  it("create should block when hard cap enforcement throws", async () => {
    enforcementMock.assertWithinHardCap.mockImplementation(() => {
      throw new Error("HARD_CAP");
    });

    const dto: CreateSessionDto = {
      tenantId,
      groupId: "g1",
      startsAt: new Date("2025-01-01T09:00:00Z"),
      endsAt: new Date("2025-01-01T10:00:00Z"),
      title: "Kids service",
    };

    await expect(
      controller.create(dto, tenantId, orgId, managerRequest),
    ).rejects.toThrow("HARD_CAP");
    expect(serviceMock.create).not.toHaveBeenCalled();
  });

  it("update should call service and return session", async () => {
    const dto: UpdateSessionDto = {
      title: "Updated",
      startsAt: undefined,
      endsAt: undefined,
      groupId: undefined,
    };
    const updated: SessionShape = { ...baseSession, title: "Updated" };
    serviceMock.update.mockResolvedValueOnce(updated);

    const res = await controller.update(
      baseSession.id,
      dto,
      tenantId,
      orgId,
      managerRequest,
    );
    expect(res).toEqual(updated);
    expect(serviceMock.update).toHaveBeenCalledWith(
      baseSession.id,
      dto,
      tenantId,
    );
  });

  it("update should 400 when endsAt <= startsAt (DTO validation)", async () => {
    const bad: UpdateSessionDto = {
      startsAt: new Date("2025-01-01T11:00:00Z"),
      endsAt: new Date("2025-01-01T10:00:00Z"),
    };
    await expect(
      controller.update("sess-1", bad, tenantId, orgId, managerRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(serviceMock.update).not.toHaveBeenCalled();
  });

  it("getStaffAttendance should return roster", async () => {
    const res = await controller.getStaffAttendance(
      baseSession.id,
      tenantId,
      orgId,
      managerRequest,
    );
    expect(res).toEqual(staffAttendanceRoster);
    expect(staffAttendanceMock.getRoster).toHaveBeenCalledWith(
      baseSession.id,
      tenantId,
    );
  });

  it("patchStaffAttendance should require auth and call upsert", async () => {
    const markerUserId = "33333333-3333-3333-3333-333333333333";
    const req = { authUserId: markerUserId } as Parameters<
      typeof controller.patchStaffAttendance
    >[2];
    const res = await controller.patchStaffAttendance(
      baseSession.id,
      {
        staffUserId: "22222222-2222-2222-2222-222222222222",
        status: "PRESENT",
      },
      req,
      tenantId,
      orgId,
    );
    expect(res).toEqual(staffAttendanceRoster);
    expect(staffAttendanceMock.upsert).toHaveBeenCalledWith(
      baseSession.id,
      tenantId,
      markerUserId,
      {
        staffUserId: "22222222-2222-2222-2222-222222222222",
        status: "PRESENT",
      },
    );
  });

  it("limits a staff member's session list to their assignments", async () => {
    rotaAccess.canManage.mockResolvedValue(false);
    serviceMock.list.mockResolvedValueOnce([]);

    await controller.list({}, tenantId, orgId, staffRequest);

    expect(serviceMock.list).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId, staffUserId: "staff-1" }),
    );
  });

  it("hides unrelated session details and rosters", async () => {
    rotaAccess.assertSessionVisible.mockRejectedValue(
      new NotFoundException("Session not found"),
    );

    await expect(
      controller.getById(baseSession.id, tenantId, orgId, staffRequest),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.getStaffAttendance(
        baseSession.id,
        tenantId,
        orgId,
        staffRequest,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.patchStaffAttendance(
        baseSession.id,
        { staffUserId, status: "PRESENT" },
        staffRequest,
        tenantId,
        orgId,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(serviceMock.getById).not.toHaveBeenCalled();
    expect(staffAttendanceMock.getRoster).not.toHaveBeenCalled();
    expect(staffAttendanceMock.upsert).not.toHaveBeenCalled();
  });

  it("rejects staff session writes before reaching the service", async () => {
    rotaAccess.assertManager.mockRejectedValue(
      new ForbiddenException("Rota management is not available"),
    );
    const dto: CreateSessionDto = {
      tenantId,
      startsAt: new Date("2025-01-01T09:00:00Z"),
      endsAt: new Date("2025-01-01T10:00:00Z"),
    };

    await expect(
      controller.create(dto, tenantId, orgId, staffRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.bulkCreate({}, tenantId, orgId, staffRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.update(baseSession.id, {}, tenantId, orgId, staffRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.delete(baseSession.id, tenantId, orgId, staffRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.publishForFamily(
        baseSession.id,
        tenantId,
        orgId,
        staffRequest,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.unpublishForFamily(
        baseSession.id,
        tenantId,
        orgId,
        staffRequest,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(serviceMock.create).not.toHaveBeenCalled();
    expect(serviceMock.update).not.toHaveBeenCalled();
    expect(familyTimetable.setPublication).not.toHaveBeenCalled();
  });
});
