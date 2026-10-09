import { Test, TestingModule } from "@nestjs/testing";
import { AssignmentsController } from "../assignments.controller";
import {
  AssignmentsService,
  type TeamScheduleRow,
} from "../assignments.service";
import { Role, AssignmentStatus } from "@pathway/db";
import { CreateAssignmentDto } from "../dto/create-assignment.dto";
import { UpdateAssignmentDto } from "../dto/update-assignment.dto";
import type { TeamScheduleQueryDto } from "../dto/team-schedule-query.dto";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { EntitlementsEnforcementService } from "../../billing/entitlements-enforcement.service";
import { RotaAccessService } from "../../sessions/rota-access.service";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";

type AssignmentShape = {
  id: string;
  sessionId: string;
  userId: string;
  role: Role;
  status: AssignmentStatus;
  createdAt: Date;
  updatedAt: Date;
};

describe("AssignmentsController", () => {
  let controller: AssignmentsController;
  const now = new Date("2025-01-01T12:00:00Z");
  const assignment: AssignmentShape = {
    id: "a1b2c3d4-e5f6-4711-9222-123456789000",
    sessionId: "11111111-1111-1111-1111-111111111111",
    userId: "22222222-2222-2222-2222-222222222222",
    role: Role.TEACHER,
    status: AssignmentStatus.CONFIRMED,
    createdAt: now,
    updatedAt: now,
  };

  type FindAllQuery = {
    tenantId: string;
    sessionId?: string;
    userId?: string;
    role?: Role;
    status?: AssignmentStatus;
  };

  type ServiceMock = {
    create: jest.Mock<
      Promise<AssignmentShape>,
      [CreateAssignmentDto, string, string]
    >;
    findAll: jest.Mock<Promise<readonly AssignmentShape[]>, [FindAllQuery]>;
    findTeamSchedule: jest.Mock<
      Promise<TeamScheduleRow[]>,
      [string, TeamScheduleQueryDto]
    >;
    findOne: jest.Mock<Promise<AssignmentShape>, [string, string]>;
    update: jest.Mock<
      Promise<AssignmentShape>,
      [string, UpdateAssignmentDto, string, string, string | undefined]
    >;
    remove: jest.Mock<
      Promise<{ deleted: boolean; id: string }>,
      [string, string]
    >;
  };

  let service: ServiceMock;
  let enforcement: jest.Mocked<
    Pick<
      EntitlementsEnforcementService,
      "checkAv30ForOrg" | "assertWithinHardCap"
    >
  >;
  const actorRequest = { authUserId: assignment.userId } as Parameters<
    AssignmentsController["create"]
  >[3];
  const rotaAccess = {
    canManage: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    assertManager: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    assertTeamViewer: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };

  const createMockService = (): ServiceMock => ({
    create: jest.fn(),
    findAll: jest.fn(),
    findTeamSchedule: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  });

  beforeEach(async () => {
    const mock = createMockService();
    const enforcementMock: typeof enforcement = {
      checkAv30ForOrg: jest.fn().mockResolvedValue({
        orgId: "org-123",
        currentAv30: 10,
        av30Cap: 100,
        status: "OK",
        graceUntil: null,
        messageCode: "av30.ok",
      }),
      assertWithinHardCap: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AssignmentsController],
      providers: [
        { provide: AssignmentsService, useValue: mock },
        { provide: EntitlementsEnforcementService, useValue: enforcementMock },
        { provide: RotaAccessService, useValue: rotaAccess },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AssignmentsController>(AssignmentsController);
    service = module.get(AssignmentsService) as unknown as ServiceMock;
    enforcement = module.get(
      EntitlementsEnforcementService,
    ) as unknown as typeof enforcementMock;
    rotaAccess.canManage.mockResolvedValue(true);
    rotaAccess.assertManager.mockResolvedValue(undefined);
    rotaAccess.assertTeamViewer.mockResolvedValue(undefined);
  });

  describe("create", () => {
    it("should call service.create and return the assignment", async () => {
      service.create.mockResolvedValue(assignment);
      const dto: CreateAssignmentDto = {
        sessionId: assignment.sessionId,
        userId: assignment.userId,
        role: assignment.role,
        status: AssignmentStatus.CONFIRMED,
      };

      const result = await controller.create(
        dto,
        "tenant-1",
        "org-123",
        actorRequest,
      );
      expect(service.create).toHaveBeenCalledWith(dto, "tenant-1", "org-123");
      expect(result).toEqual(assignment);
    });

    it("blocks create when hard cap is reached", async () => {
      enforcement.assertWithinHardCap.mockImplementation(() => {
        throw new Error("HARD_CAP");
      });
      const dto: CreateAssignmentDto = {
        sessionId: assignment.sessionId,
        userId: assignment.userId,
        role: assignment.role,
      };

      await expect(
        controller.create(dto, "tenant-1", "org-123", actorRequest),
      ).rejects.toThrow("HARD_CAP");
      expect(service.create).not.toHaveBeenCalled();
    });
  });

  describe("findAll", () => {
    it("should return an array of assignments (optionally filtered)", async () => {
      service.findAll.mockResolvedValue([assignment]);
      const result = await controller.findAll(
        {
          sessionId: assignment.sessionId,
          userId: assignment.userId,
          role: assignment.role,
          status: assignment.status,
        },
        "tenant-1",
        "org-123",
        actorRequest,
      );
      expect(service.findAll).toHaveBeenCalledWith({
        tenantId: "tenant-1",
        sessionId: assignment.sessionId,
        userId: assignment.userId,
        role: assignment.role,
        status: assignment.status,
      });
      expect(result).toEqual([assignment]);
    });
  });

  describe("findTeamSchedule", () => {
    const query = { dateFrom: "2026-10-05", dateTo: "2026-10-11" };

    it("returns only the selected site's team schedule after access check", async () => {
      service.findTeamSchedule.mockResolvedValue([]);
      await expect(
        controller.findTeamSchedule(query, "site-1", "org-123", actorRequest),
      ).resolves.toEqual([]);
      expect(rotaAccess.assertTeamViewer).toHaveBeenCalledWith({
        userId: assignment.userId,
        tenantId: "site-1",
        orgId: "org-123",
        isSuperUser: false,
      });
      expect(service.findTeamSchedule).toHaveBeenCalledWith("site-1", query);
    });

    it("rejects invalid or excessive date windows before reading", async () => {
      for (const invalid of [
        { dateFrom: "2026-02-30", dateTo: "2026-03-02" },
        { dateFrom: "2026-10-05", dateTo: "2026-10-12" },
        { dateFrom: "2026-10-11", dateTo: "2026-10-05" },
      ]) {
        await expect(
          controller.findTeamSchedule(
            invalid,
            "site-1",
            "org-123",
            actorRequest,
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
      expect(service.findTeamSchedule).not.toHaveBeenCalled();
    });

    it("does not read team data when the actor is denied", async () => {
      rotaAccess.assertTeamViewer.mockRejectedValueOnce(
        new ForbiddenException(),
      );
      await expect(
        controller.findTeamSchedule(query, "site-1", "org-123", actorRequest),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.findTeamSchedule).not.toHaveBeenCalled();
    });
  });

  describe("findOne", () => {
    it("should return a single assignment", async () => {
      service.findOne.mockResolvedValue(assignment);
      const result = await controller.findOne(
        assignment.id,
        "tenant-1",
        "org-123",
        actorRequest,
      );
      expect(service.findOne).toHaveBeenCalledWith(assignment.id, "tenant-1");
      expect(result).toEqual(assignment);
    });
  });

  describe("update", () => {
    it("should call service.update and return the updated assignment", async () => {
      const updated: AssignmentShape = {
        ...assignment,
        status: AssignmentStatus.DECLINED,
        updatedAt: new Date(now.getTime() + 1000),
      };
      service.update.mockResolvedValue(updated);
      const dto: UpdateAssignmentDto = { status: AssignmentStatus.DECLINED };
      const result = await controller.update(
        assignment.id,
        dto,
        "tenant-1",
        "org-123",
        actorRequest,
      );
      expect(service.update).toHaveBeenCalledWith(
        assignment.id,
        dto,
        "tenant-1",
        "org-123",
        undefined,
      );
      expect(result).toEqual(updated);
    });
  });

  describe("remove", () => {
    it("should call service.remove and return the deletion result", async () => {
      const deletionResult = { deleted: true, id: assignment.id };
      service.remove.mockResolvedValue(deletionResult);

      const result = await controller.remove(
        assignment.id,
        "tenant-1",
        "org-123",
        actorRequest,
      );
      expect(service.remove).toHaveBeenCalledWith(assignment.id, "tenant-1");
      expect(result).toEqual(deletionResult);
    });
  });

  it("binds staff list requests to the signed-in user", async () => {
    rotaAccess.canManage.mockResolvedValue(false);
    service.findAll.mockResolvedValue([assignment]);

    await controller.findAll({}, "tenant-1", "org-123", actorRequest);
    expect(service.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ userId: assignment.userId }),
    );
    await expect(
      controller.findAll(
        { userId: "33333333-3333-4333-9333-333333333333" },
        "tenant-1",
        "org-123",
        actorRequest,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("hides another staff member's assignment and denies a status change", async () => {
    rotaAccess.canManage.mockResolvedValue(false);
    service.findOne.mockResolvedValue({
      ...assignment,
      userId: "33333333-3333-4333-9333-333333333333",
    });
    await expect(
      controller.findOne(assignment.id, "tenant-1", "org-123", actorRequest),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      controller.update(
        assignment.id,
        { status: AssignmentStatus.DECLINED },
        "tenant-1",
        "org-123",
        actorRequest,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(service.update).not.toHaveBeenCalled();
  });
});
