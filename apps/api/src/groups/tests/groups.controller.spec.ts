import { Test, TestingModule } from "@nestjs/testing";
import { NotFoundException } from "@nestjs/common";
import { GroupsController } from "../../groups/groups.controller";
import { GroupsService } from "../../groups/groups.service";
import type { UpdateGroupDto } from "../../groups/dto/update-group.dto";
import { AuthUserGuard } from "../../auth/auth-user.guard";

describe("GroupsController", () => {
  let controller: GroupsController;
  let service: GroupsService;
  const tenantId = "t1";

  const group = {
    id: "g1",
    name: "Kids 7-9",
    tenantId: "t1",
    minAge: 7,
    maxAge: 9,
  };

  const mockService = {
    list: jest.fn().mockResolvedValue([group]),
    getById: jest.fn().mockResolvedValue(group),
    create: jest.fn().mockResolvedValue(group),
    update: jest.fn().mockResolvedValue({
      ...group,
      name: "Kids 6-10",
      minAge: 6,
      maxAge: 10,
    }),
  } as const;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupsController],
      providers: [{ provide: GroupsService, useValue: mockService }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<GroupsController>(GroupsController);
    service = module.get<GroupsService>(GroupsService);

    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("list should return array", async () => {
    await expect(controller.list(tenantId)).resolves.toEqual([group]);
    expect(service.list).toHaveBeenCalledWith(tenantId, { activeOnly: false });
  });

  it("getById should return a group when found", async () => {
    (service.getById as jest.Mock).mockResolvedValueOnce(group);
    await expect(controller.getById("g1", tenantId)).resolves.toEqual(group);
    expect(service.getById).toHaveBeenCalledWith("g1", tenantId);
  });

  it("getById should throw NotFound when missing", async () => {
    (service.getById as jest.Mock).mockResolvedValueOnce(null);
    await expect(
      controller.getById("missing", tenantId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("create should call service and return group", async () => {
    const dto = { name: "Kids 7-9", tenantId, minAge: 7, maxAge: 9 };
    await expect(controller.create(dto, tenantId)).resolves.toEqual(group);
    expect(service.create).toHaveBeenCalledWith(dto, tenantId);
  });

  it("update should call service and return updated group", async () => {
    const payload: UpdateGroupDto = {
      name: "Kids 6-10",
      minAge: 6,
      maxAge: 10,
    };
    const result = await controller.update("g1", payload, tenantId);
    expect(service.update).toHaveBeenCalledWith("g1", payload, tenantId);
    expect(result).toMatchObject({ name: "Kids 6-10", minAge: 6, maxAge: 10 });
  });
});
