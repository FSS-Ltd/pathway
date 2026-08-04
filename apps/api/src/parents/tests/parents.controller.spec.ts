import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import {
  PathwayRequestContext,
  UserOrgRole,
  UserTenantRole,
} from "@pathway/auth";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { PublicSignupService } from "../../public-signup/public-signup.service";
import { ParentsController } from "../parents.controller";
import { ParentsService } from "../parents.service";
import type { ParentDetailDto, ParentSummaryDto } from "../dto/parents.dto";

const mockPublicSignupService = {
  linkChildrenExistingUser: jest.fn(),
};

const tenantId = "tenant-1";
const orgId = "org-1";

const listMock: jest.Mock<
  Promise<ParentSummaryDto[]>,
  [string, string]
> = jest.fn();
const getMock: jest.Mock<
  Promise<ParentDetailDto | null>,
  [string, string, string]
> = jest.fn();

const mockService: ParentsService = {
  findAllForTenant: listMock as unknown as ParentsService["findAllForTenant"],
  findOneForTenant: getMock as unknown as ParentsService["findOneForTenant"],
} as ParentsService;

const buildRequestContext = (roles?: {
  tenant?: UserTenantRole[];
  org?: UserOrgRole[];
}): PathwayRequestContext =>
  ({
    roles: {
      tenant: roles?.tenant ?? [],
      org: roles?.org ?? [],
    },
  }) as PathwayRequestContext;

describe("ParentsController", () => {
  let controller: ParentsController;
  let requestContext: PathwayRequestContext;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParentsController],
      providers: [
        { provide: ParentsService, useValue: mockService },
        {
          provide: PublicSignupService,
          useValue: mockPublicSignupService,
        },
        {
          provide: PathwayRequestContext,
          useValue: buildRequestContext({
            tenant: [UserTenantRole.ADMIN],
          }),
        },
      ],
    })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ParentsController>(ParentsController);
    requestContext = module.get<PathwayRequestContext>(PathwayRequestContext);
  });

  it("lists parents for tenant/org", async () => {
    const rows: ParentSummaryDto[] = [
      {
        id: "p1",
        fullName: "Parent One",
        email: "parent1@test.local",
        childrenCount: 1,
      },
    ];
    listMock.mockResolvedValueOnce(rows);

    const result = await controller.list(tenantId, orgId);

    expect(result).toEqual(rows);
    expect(listMock).toHaveBeenCalledWith(tenantId, orgId);
  });

  it("returns detail when parent in tenant", async () => {
    const detail: ParentDetailDto = {
      id: "p1",
      fullName: "Parent One",
      email: "parent1@test.local",
      children: [{ id: "c1", fullName: "Jess Doe" }],
    };
    getMock.mockResolvedValueOnce(detail);

    const mockReq = { authUserId: "u1" } as Parameters<
      ParentsController["getOne"]
    >[1];
    const result = await controller.getOne("p1", mockReq, tenantId, orgId);

    expect(result).toEqual(detail);
    expect(getMock).toHaveBeenCalledWith(tenantId, orgId, "p1");
  });

  it("404s when parent missing", async () => {
    getMock.mockResolvedValueOnce(null);

    const mockReq = { authUserId: "u1" } as Parameters<
      ParentsController["getOne"]
    >[1];
    await expect(
      controller.getOne("missing", mockReq, tenantId, orgId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("forbids caller without staff roles", async () => {
    const ctx = requestContext as PathwayRequestContext & {
      roles: { tenant: UserTenantRole[]; org: UserOrgRole[] };
    };
    ctx.roles = { tenant: [UserTenantRole.PARENT], org: [] };
    await expect(controller.list(tenantId, orgId)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(listMock).not.toHaveBeenCalled();
  });
});
