import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { PathwayRequestContext } from "@pathway/auth";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { ChildrenController } from "../../children/children.controller";
import { ChildrenService } from "../../children/children.service";

const mockRequestContext = {
  roles: { org: [], tenant: [] },
} as unknown as PathwayRequestContext;
import { CreateChildDto } from "../../children/dto/create-child.dto";
import { UpdateChildDto } from "../../children/dto/update-child.dto";

const tenantId = "t1";

const listMock: jest.Mock<Promise<unknown[]>, [string]> = jest.fn();
const getByIdMock: jest.Mock<Promise<unknown>, [string, string]> = jest.fn();
const createMock: jest.Mock<
  Promise<unknown>,
  [CreateChildDto, string]
> = jest.fn();
const updateMock: jest.Mock<
  Promise<unknown>,
  [string, UpdateChildDto, string, string | undefined, boolean]
> = jest.fn();
const assertCanViewChildMock = jest.fn().mockResolvedValue(undefined);
const staffRequest = {
  authUserId: "staff-a",
  __pathwayContext: { siteRole: "STAFF" },
} as Parameters<ChildrenController["list"]>[1];

const mockService: ChildrenService = {
  list: listMock as unknown as ChildrenService["list"],
  getById: getByIdMock as unknown as ChildrenService["getById"],
  create: createMock as unknown as ChildrenService["create"],
  update: updateMock as unknown as ChildrenService["update"],
  assertCanViewChild: assertCanViewChildMock,
} as unknown as ChildrenService;

describe("ChildrenController", () => {
  let controller: ChildrenController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChildrenController],
      providers: [
        { provide: ChildrenService, useValue: mockService },
        { provide: PathwayRequestContext, useValue: mockRequestContext },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ChildrenController>(ChildrenController);
  });

  it("list should return array", async () => {
    const row = { id: "c1", firstName: "Jess", lastName: "Doe" };
    listMock.mockResolvedValueOnce([row]);

    const res = await controller.list(tenantId, staffRequest);
    expect(Array.isArray(res)).toBe(true);
    expect(res).toEqual([row]);
    expect(listMock).toHaveBeenCalledWith(tenantId);
  });

  it("does not expose the child list or create route to a guardian session", async () => {
    const parentRequest = {
      authUserId: "guardian-a",
      __pathwayContext: { siteRole: "VIEWER" },
    } as Parameters<ChildrenController["list"]>[1];
    await expect(
      controller.list(tenantId, parentRequest),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.create(
        { firstName: "Sam", lastName: "Child" },
        tenantId,
        parentRequest,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(listMock).not.toHaveBeenCalled();
    expect(createMock).not.toHaveBeenCalled();
  });

  it("getById should return a child", async () => {
    const child = { id: "c1", firstName: "Jess", lastName: "Doe" };
    getByIdMock.mockResolvedValueOnce(child);

    const res = await controller.getById("c1", tenantId, staffRequest);
    expect(res).toBe(child);
    expect(getByIdMock).toHaveBeenCalledWith("c1", tenantId);
  });

  it("create should validate and call service", async () => {
    const dto: CreateChildDto = {
      firstName: "Jess",
      lastName: "Doe",
      allergies: "peanuts",
      photoConsent: false,
    };
    const created = { id: "c1", ...dto };
    createMock.mockResolvedValueOnce(created);

    const res = await controller.create(dto, tenantId, staffRequest);
    expect(res).toEqual(created);
    expect(createMock).toHaveBeenCalledWith(dto, tenantId);
  });

  it("create should 400 on invalid body (missing firstName)", async () => {
    const bad = {
      lastName: "Doe",
      allergies: "none",
    } as unknown as CreateChildDto;

    await expect(
      controller.create(bad, tenantId, staffRequest),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(createMock).not.toHaveBeenCalled();
  });

  it("update should validate and call service", async () => {
    const updated = { id: "c1", firstName: "New", lastName: "Name" };
    updateMock.mockResolvedValueOnce(updated);

    const mockReq = {
      authUserId: "u1",
      __pathwayContext: { siteRole: null },
    } as Parameters<ChildrenController["update"]>[3];

    const res = await controller.update(
      "c1",
      {
        firstName: "New",
        lastName: "Name",
      },
      tenantId,
      mockReq,
    );
    expect(res).toEqual(updated);
    expect(updateMock).toHaveBeenCalledWith(
      "c1",
      {
        firstName: "New",
        lastName: "Name",
      },
      tenantId,
      "u1",
      false,
    );
  });

  it("update should 400 on invalid uuid for groupId", async () => {
    const mockReq = {
      authUserId: "u1",
      __pathwayContext: { siteRole: null },
    } as Parameters<ChildrenController["update"]>[3];
    await expect(
      controller.update("c1", { groupId: "not-a-uuid" }, tenantId, mockReq),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
