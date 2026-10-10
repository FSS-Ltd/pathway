import { BadRequestException, GoneException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { PermissionGuard } from "../../access-control/permission.guard";
import { AnnouncementsController } from "../announcements.controller";
import { AnnouncementsService } from "../announcements.service";

const tenantId = "11111111-1111-1111-1111-111111111111";
const orgId = "22222222-2222-2222-2222-222222222222";
const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

describe("AnnouncementsController", () => {
  let controller: AnnouncementsController;
  const service = {
    findAll: jest.fn(),
    findOne: jest.fn(),
    retiredWrite: jest.fn(() => {
      throw new GoneException("Use site notice commands");
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AnnouncementsController],
      providers: [{ provide: AnnouncementsService, useValue: service }],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = moduleRef.get(AnnouncementsController);
  });

  it("forwards validated site-scoped filters", async () => {
    service.findAll.mockResolvedValue([]);
    await controller.findAll(
      {
        __vercel_path: "announcements",
        audience: "ALL",
        publishedOnly: "true",
      },
      tenantId,
      orgId,
    );
    expect(service.findAll).toHaveBeenCalledWith({
      tenantId,
      orgId,
      audience: "ALL",
      publishedOnly: true,
    });
    await expect(
      controller.findAll({ audience: "CHILDREN" }, tenantId, orgId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates detail ID and forwards the selected site", async () => {
    service.findOne.mockResolvedValue({ id });
    await controller.findOne(id, tenantId, orgId);
    expect(service.findOne).toHaveBeenCalledWith(id, tenantId, orgId);
    await expect(
      controller.findOne("invalid", tenantId, orgId),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns gone for old create, edit, and delete routes", () => {
    expect(() => controller.retiredCreate()).toThrow(GoneException);
    expect(() => controller.retiredUpdate()).toThrow(GoneException);
    expect(() => controller.retiredDelete()).toThrow(GoneException);
    expect(service.retiredWrite).toHaveBeenCalledTimes(3);
  });
});
