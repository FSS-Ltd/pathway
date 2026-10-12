import { Test, TestingModule } from "@nestjs/testing";
import { AssignmentsController } from "../assignments.controller";
import { AssignmentsService } from "../assignments.service";
import { Role, AssignmentStatus } from "@pathway/db";
import { CreateAssignmentDto } from "../dto/create-assignment.dto";
import { UpdateAssignmentDto } from "../dto/update-assignment.dto";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { EntitlementsEnforcementService } from "../../billing/entitlements-enforcement.service";

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

  const createMockService = (): ServiceMock => ({
    create: jest.fn(),
    findAll: jest.fn(),
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

      const result = await controller.create(dto, "tenant-1", "org-123");
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
        controller.create(dto, "tenant-1", "org-123"),
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

  describe("findOne", () => {
    it("should return a single assignment", async () => {
      service.findOne.mockResolvedValue(assignment);
      const result = await controller.findOne(assignment.id, "tenant-1");
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
      const req = { authUserId: "user-1" } as Parameters<
        AssignmentsController["update"]
      >[4];

      const result = await controller.update(
        assignment.id,
        dto,
        "tenant-1",
        "org-123",
        req,
      );
      expect(service.update).toHaveBeenCalledWith(
        assignment.id,
        dto,
        "tenant-1",
        "org-123",
        "user-1",
      );
      expect(result).toEqual(updated);
    });
  });

  describe("remove", () => {
    it("should call service.remove and return the deletion result", async () => {
      const deletionResult = { deleted: true, id: assignment.id };
      service.remove.mockResolvedValue(deletionResult);

      const result = await controller.remove(assignment.id, "tenant-1");
      expect(service.remove).toHaveBeenCalledWith(assignment.id, "tenant-1");
      expect(result).toEqual(deletionResult);
    });
  });
});
