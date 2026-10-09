/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { SwapsController } from "../..//swaps/swaps.controller";
import { SwapsService } from "../..//swaps/swaps.service";
import { CreateSwapDto, UpdateSwapDto } from "../..//swaps/dto";
import { SwapStatus } from "@pathway/db";
import { RotaAccessService } from "../../sessions/rota-access.service";

type SwapRecord = {
  id: string;
  assignmentId: string;
  fromUserId: string;
  toUserId: string | null;
  status: SwapStatus;
  createdAt: Date;
  updatedAt: Date;
};

describe("SwapsController", () => {
  let controller: SwapsController;
  const tenantId = "t1";
  const orgId = "o1";

  const now = new Date();

  const base: SwapRecord = {
    id: "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa",
    assignmentId: "11111111-1111-4111-9111-111111111111",
    fromUserId: "22222222-2222-4222-9222-222222222222",
    toUserId: "33333333-3333-4333-9333-333333333333",
    status: SwapStatus.REQUESTED,
    createdAt: now,
    updatedAt: now,
  };
  const actorRequest = { authUserId: base.fromUserId } as Parameters<
    SwapsController["create"]
  >[3];
  const recipientRequest = { authUserId: base.toUserId! } as Parameters<
    SwapsController["create"]
  >[3];
  const rotaAccess = {
    canManage: jest.fn<Promise<boolean>, []>().mockResolvedValue(true),
    assertManager: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
  };

  const createDto: CreateSwapDto = {
    assignmentId: base.assignmentId,
    fromUserId: base.fromUserId,
    toUserId: base.toUserId!,
  };

  const updateDtoAccept: UpdateSwapDto = {
    status: SwapStatus.ACCEPTED,
    toUserId: base.toUserId!,
  };

  const updateDtoDecline: UpdateSwapDto = {
    status: SwapStatus.DECLINED,
  };

  const serviceMock: Record<keyof SwapsService, any> = {
    create: jest.fn(
      async (dto: CreateSwapDto, _t: string): Promise<SwapRecord> => ({
        ...base,
        id: "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb",
        assignmentId: dto.assignmentId,
        fromUserId: dto.fromUserId,
        toUserId: dto.toUserId ?? null,
        status: SwapStatus.REQUESTED,
      }),
    ),
    findOne: jest.fn(
      async (id: string, _t: string): Promise<SwapRecord | null> => ({
        ...base,
        id,
      }),
    ),
    findAll: jest
      .fn(async (_filters: any): Promise<SwapRecord[]> => [base])
      .mockImplementation(async () => [base]),
    findCandidates: jest.fn(async () => [
      { id: base.toUserId, fullName: "Recipient" },
    ]),
    update: jest.fn(
      async (
        id: string,
        dto: UpdateSwapDto,
        _t: string,
        _org: string,
      ): Promise<SwapRecord> => {
        if (dto.status === SwapStatus.ACCEPTED && !dto.toUserId) {
          throw new BadRequestException(
            "toUserId is required when status is ACCEPTED",
          );
        }
        return {
          ...base,
          id,
          status: dto.status ?? base.status,
          toUserId: dto.toUserId ?? base.toUserId,
          updatedAt: new Date(),
        };
      },
    ),
    remove: jest.fn(
      async (_id: string, _t: string): Promise<any> => ({
        count: 1,
      }),
    ),
  } as unknown as SwapsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [SwapsController],
      providers: [
        { provide: SwapsService, useValue: serviceMock },
        { provide: RotaAccessService, useValue: rotaAccess },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<SwapsController>(SwapsController);
    jest.clearAllMocks();
    rotaAccess.canManage.mockResolvedValue(true);
    rotaAccess.assertManager.mockResolvedValue(undefined);
  });

  describe("create", () => {
    it("should call service.create and return the created swap", async () => {
      const result = await controller.create(
        createDto,
        tenantId,
        orgId,
        actorRequest,
      );
      expect(serviceMock.create).toHaveBeenCalledWith(createDto, tenantId);
      expect(result).toMatchObject({
        assignmentId: createDto.assignmentId,
        fromUserId: createDto.fromUserId,
        status: SwapStatus.REQUESTED,
      });
    });

    it("should 400 on invalid UUIDs", async () => {
      await expect(
        controller.create(
          {
            ...createDto,
            assignmentId: "not-a-uuid",
          } as unknown as CreateSwapDto,
          tenantId,
          orgId,
          actorRequest,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      await expect(
        controller.create(
          {
            ...createDto,
            fromUserId: "also-bad",
          } as unknown as CreateSwapDto,
          tenantId,
          orgId,
          actorRequest,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("should 400 when end-user validation fails in DTO parsing (e.g. empty body)", async () => {
      await expect(
        controller.create(
          {} as unknown as CreateSwapDto,
          tenantId,
          orgId,
          actorRequest,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("findOne", () => {
    it("should validate id and return a swap", async () => {
      const res = await controller.findOne(
        base.id,
        tenantId,
        orgId,
        actorRequest,
      );
      expect(serviceMock.findOne).toHaveBeenCalledWith(base.id, tenantId);
      expect(res).toMatchObject({ id: base.id });
    });

    it("should 400 on invalid id", async () => {
      await expect(
        controller.findOne("bad-id", tenantId, orgId, actorRequest),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("findAll", () => {
    it("should call service.findAll with optional filters", async () => {
      const res = await controller.findAll({}, tenantId, orgId, actorRequest);
      expect(serviceMock.findAll).toHaveBeenCalledTimes(1);
      expect(Array.isArray(res)).toBe(true);
    });
  });

  describe("findCandidates", () => {
    it("binds candidate discovery to the authenticated assignment holder and site", async () => {
      const result = await controller.findCandidates(
        base.assignmentId,
        tenantId,
        orgId,
        actorRequest,
      );
      expect(serviceMock.findCandidates).toHaveBeenCalledWith(
        base.assignmentId,
        base.fromUserId,
        tenantId,
      );
      expect(result).toEqual([{ id: base.toUserId, fullName: "Recipient" }]);
    });

    it("rejects an invalid assignment ID before querying", async () => {
      await expect(
        controller.findCandidates("bad-id", tenantId, orgId, actorRequest),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(serviceMock.findCandidates).not.toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("should accept a swap when toUserId is supplied", async () => {
      const updated = await controller.update(
        base.id,
        updateDtoAccept,
        tenantId,
        orgId,
        actorRequest,
      );
      expect(serviceMock.update).toHaveBeenCalledWith(
        base.id,
        updateDtoAccept,
        tenantId,
        orgId,
      );
      expect(updated.status).toBe(SwapStatus.ACCEPTED);
    });

    it("should 400 when status ACCEPTED and toUserId missing", async () => {
      await expect(
        controller.update(
          base.id,
          { status: SwapStatus.ACCEPTED },
          tenantId,
          orgId,
          actorRequest,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it("should call service.update for decline", async () => {
      const updated = await controller.update(
        base.id,
        updateDtoDecline,
        tenantId,
        orgId,
        actorRequest,
      );
      expect(serviceMock.update).toHaveBeenCalledWith(
        base.id,
        updateDtoDecline,
        tenantId,
        orgId,
      );
      expect(updated.status).toBe(SwapStatus.DECLINED);
    });

    it("should 400 on invalid id", async () => {
      await expect(
        controller.update(
          "nope",
          updateDtoDecline,
          tenantId,
          orgId,
          actorRequest,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe("remove", () => {
    it("should call service.remove", async () => {
      const removed = await controller.remove(
        base.id,
        tenantId,
        orgId,
        actorRequest,
      );
      expect(serviceMock.remove).toHaveBeenCalledWith(base.id, tenantId);
      expect(removed).toEqual({ count: 1 });
    });

    it("should 400 on invalid id", async () => {
      await expect(
        controller.remove("bad", tenantId, orgId, actorRequest),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  it("limits staff swap lists to participation and rejects another actor filter", async () => {
    rotaAccess.canManage.mockResolvedValue(false);
    await controller.findAll({}, tenantId, orgId, actorRequest);
    expect(serviceMock.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ participantUserId: base.fromUserId }),
    );
    await expect(
      controller.findAll(
        { fromUserId: base.toUserId },
        tenantId,
        orgId,
        actorRequest,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("denies staff access to an unrelated swap and permits the recipient decision", async () => {
    rotaAccess.canManage.mockResolvedValue(false);
    await expect(
      controller.findOne(base.id, tenantId, orgId, {
        authUserId: "44444444-4444-4444-8444-444444444444",
      } as typeof actorRequest),
    ).rejects.toBeInstanceOf(NotFoundException);
    await controller.update(
      base.id,
      { status: SwapStatus.DECLINED },
      tenantId,
      orgId,
      recipientRequest,
    );
    expect(serviceMock.update).toHaveBeenCalledWith(
      base.id,
      { status: SwapStatus.DECLINED },
      tenantId,
      orgId,
    );
  });
});
