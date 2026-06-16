import { Test, TestingModule } from "@nestjs/testing";
import { OrgsController } from "../orgs.controller";
import { OrgsService } from "../orgs.service";
import { PathwayAuthGuard } from "@pathway/auth";
import { AuthUserGuard } from "../../auth/auth-user.guard";
import { BadRequestException } from "@nestjs/common";

jest.mock("@pathway/db", () => ({
  prisma: {
    orgMembership: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    userOrgRole: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
    invite: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    tenant: {
      findMany: jest.fn(),
    },
    siteMembership: {
      findMany: jest.fn(),
    },
  },
  OrgRole: { ORG_ADMIN: "ORG_ADMIN", ORG_MEMBER: "ORG_MEMBER" },
}));

type MockPrisma = {
  orgMembership: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  userOrgRole: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
  };
  invite: {
    findMany: jest.Mock;
  };
  user: {
    findMany: jest.Mock;
  };
  tenant: {
    findMany: jest.Mock;
  };
  siteMembership: {
    findMany: jest.Mock;
  };
};

const { prisma: mockPrisma } = jest.requireMock("@pathway/db") as {
  prisma: MockPrisma;
};

// Helper type: the resolved return type of OrgsService.register
type RegisterReturn = Awaited<ReturnType<OrgsService["register"]>>;

describe("OrgsController", () => {
  let controller: OrgsController;

  // Create a strictly-typed mock for OrgsService using the real signatures
  const registerMock = jest.fn() as jest.MockedFunction<
    OrgsService["register"]
  >;
  const updateCurrentOrgMock = jest.fn() as jest.MockedFunction<
    OrgsService["updateCurrentOrg"]
  >;
  const getRetentionOverviewMock = jest.fn() as jest.MockedFunction<
    OrgsService["getRetentionOverview"]
  >;
  const mockOrgsService: Pick<
    OrgsService,
    "register" | "updateCurrentOrg" | "getRetentionOverview"
  > = {
    register: registerMock,
    updateCurrentOrg: updateCurrentOrgMock,
    getRetentionOverview: getRetentionOverviewMock,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrgsController],
      providers: [{ provide: OrgsService, useValue: mockOrgsService }],
    })
      .overrideGuard(PathwayAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(AuthUserGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OrgsController>(OrgsController);
    registerMock.mockReset();
    updateCurrentOrgMock.mockReset();
    getRetentionOverviewMock.mockReset();
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      role: "ORG_ADMIN",
    });
    mockPrisma.orgMembership.findMany.mockResolvedValue([]);
    mockPrisma.userOrgRole.findFirst.mockResolvedValue(null);
    mockPrisma.userOrgRole.findMany.mockResolvedValue([]);
    mockPrisma.invite.findMany.mockResolvedValue([]);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.tenant.findMany.mockResolvedValue([]);
    mockPrisma.siteMembership.findMany.mockResolvedValue([]);
  });

  it("should delegate to OrgsService.register and return the created org", async () => {
    // Infer the controller method parameter type to avoid `any`
    type ControllerRegisterParam = Parameters<OrgsController["register"]>[0];

    const payload: ControllerRegisterParam = {
      org: {
        name: "Acme Church",
        slug: "acme-church",
        planCode: "STARTER",
        isSuite: true,
      },
      initialTenant: { create: false },
      admin: { email: "admin@acme.test", fullName: "Admin User" },
    } as ControllerRegisterParam;

    const result: RegisterReturn = {
      org: {
        id: "11111111-2222-3333-4444-555555555555",
        name: "Acme Church",
        slug: "acme-church",
        planCode: "STARTER",
      },
    } as RegisterReturn;

    // Configure mock and execute
    registerMock.mockResolvedValue(result);
    const res = await controller.register(payload);

    expect(registerMock).toHaveBeenCalledTimes(1);
    expect(registerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        org: expect.objectContaining({
          name: "Acme Church",
          slug: "acme-church",
          // `planCode` is transformed by the DTO (e.g., to "trial"), so we don't assert its exact value here.
          isSuite: true,
        }),
        initialTenant: expect.objectContaining({ create: false }),
        admin: expect.objectContaining({
          email: "admin@acme.test",
          fullName: "Admin User",
        }),
      }),
    );
    expect(res).toEqual(result);
  });

  it("should surface errors thrown by the service", async () => {
    type ControllerRegisterParam = Parameters<OrgsController["register"]>[0];
    const payload: ControllerRegisterParam = {
      org: {
        name: "Bad Org",
        slug: "bad-org",
        planCode: "STARTER",
        isSuite: true,
      },
      initialTenant: { create: false },
      admin: { email: "admin@acme.test", fullName: "Admin User" },
    } as ControllerRegisterParam;

    const err = new Error("failed to register");
    registerMock.mockRejectedValue(err);

    await expect(controller.register(payload)).rejects.toThrow(
      "failed to register",
    );
    expect(registerMock).toHaveBeenCalledTimes(1);
  });

  describe("updateCurrent", () => {
    it("should return 200 and updated org when admin updates name", async () => {
      const req = { authUserId: "user-1" } as unknown as Parameters<
        OrgsController["updateCurrent"]
      >[1];
      updateCurrentOrgMock.mockResolvedValue({
        id: "org-1",
        name: "New Org Name",
        slug: "acme",
      });
      const result = await controller.updateCurrent(
        "org-1",
        req,
        { name: "New Org Name" },
      );
      expect(updateCurrentOrgMock).toHaveBeenCalledWith("org-1", {
        name: "New Org Name",
      });
      expect(result).toEqual({
        id: "org-1",
        name: "New Org Name",
        slug: "acme",
      });
    });

    it("should throw BadRequestException for invalid name (too short)", async () => {
      const req = { authUserId: "user-1" } as unknown as Parameters<
        OrgsController["updateCurrent"]
      >[1];
      await expect(
        controller.updateCurrent("org-1", req, { name: "x" }),
      ).rejects.toThrow(BadRequestException);
      expect(updateCurrentOrgMock).not.toHaveBeenCalled();
    });
  });

  describe("getCurrentRetention", () => {
    it("should return retention overview when configured", async () => {
      getRetentionOverviewMock.mockResolvedValue({
        attendanceRetentionYears: 7,
        safeguardingRetentionYears: null,
        notesRetentionYears: null,
      });
      const result = await controller.getCurrentRetention("org-1");
      expect(getRetentionOverviewMock).toHaveBeenCalledWith("org-1");
      expect(result).toEqual({
        attendanceRetentionYears: 7,
        safeguardingRetentionYears: null,
        notesRetentionYears: null,
      });
    });

    it("should return nulls when retention not configured", async () => {
      getRetentionOverviewMock.mockResolvedValue({
        attendanceRetentionYears: null,
        safeguardingRetentionYears: null,
        notesRetentionYears: null,
      });
      const result = await controller.getCurrentRetention("org-1");
      expect(result.attendanceRetentionYears).toBeNull();
      expect(result.safeguardingRetentionYears).toBeNull();
      expect(result.notesRetentionYears).toBeNull();
    });
  });

  describe("listPeople", () => {
    it("includes users who only have site membership in the org", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["listPeople"]
      >[1];

      mockPrisma.orgMembership.findMany.mockResolvedValue([
        {
          user: {
            id: "admin-user",
            name: "Admin User",
            displayName: "Admin User",
            email: "admin@example.test",
          },
          role: "ORG_ADMIN",
        },
      ]);
      mockPrisma.tenant.findMany.mockResolvedValue([{ id: "site-1" }]);
      mockPrisma.siteMembership.findMany.mockResolvedValue([
        {
          userId: "admin-user",
          tenantId: "site-1",
          user: {
            id: "admin-user",
            name: "Admin User",
            displayName: "Admin User",
            email: "admin@example.test",
          },
        },
        {
          userId: "staff-user",
          tenantId: "site-1",
          user: {
            id: "staff-user",
            name: "Staff User",
            displayName: "Staff User",
            email: "staff@example.test",
          },
        },
      ]);

      const result = await controller.listPeople("org-1", req);

      expect(result).toEqual([
        {
          id: "admin-user",
          name: "Admin User",
          displayName: "Admin User",
          email: "admin@example.test",
          orgRole: "ORG_ADMIN",
          siteAccessSummary: {
            allSites: true,
            siteCount: 1,
          },
        },
        {
          id: "staff-user",
          name: "Staff User",
          displayName: "Staff User",
          email: "staff@example.test",
          orgRole: "ORG_MEMBER",
          siteAccessSummary: {
            allSites: false,
            siteCount: 1,
          },
        },
      ]);
      expect(mockPrisma.siteMembership.findMany).toHaveBeenCalledWith({
        where: {
          tenantId: { in: ["site-1"] },
        },
        select: {
          userId: true,
          tenantId: true,
          user: {
            select: {
              id: true,
              name: true,
              displayName: true,
              email: true,
            },
          },
        },
      });
    });
  });
});
