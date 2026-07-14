import { Test, TestingModule } from "@nestjs/testing";
import { OrgsController } from "../orgs.controller";
import { OrgsService } from "../orgs.service";
import { OrgPeopleService } from "../org-people.service";
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
  const uploadLogoMock = jest.fn() as jest.MockedFunction<
    OrgsService["uploadLogo"]
  >;
  const deleteLogoMock = jest.fn() as jest.MockedFunction<
    OrgsService["deleteLogo"]
  >;
  const listPeopleMock = jest.fn() as jest.MockedFunction<
    OrgPeopleService["listPeople"]
  >;
  const listDeletedPeopleMock = jest.fn() as jest.MockedFunction<
    OrgPeopleService["listDeletedPeople"]
  >;
  const removePersonMock = jest.fn() as jest.MockedFunction<
    OrgPeopleService["removePerson"]
  >;
  const mockOrgsService: Pick<
    OrgsService,
    | "register"
    | "updateCurrentOrg"
    | "getRetentionOverview"
    | "uploadLogo"
    | "deleteLogo"
  > = {
    register: registerMock,
    updateCurrentOrg: updateCurrentOrgMock,
    getRetentionOverview: getRetentionOverviewMock,
    uploadLogo: uploadLogoMock,
    deleteLogo: deleteLogoMock,
  };
  const mockOrgPeopleService: Pick<
    OrgPeopleService,
    "listPeople" | "listDeletedPeople" | "removePerson"
  > = {
    listPeople: listPeopleMock,
    listDeletedPeople: listDeletedPeopleMock,
    removePerson: removePersonMock,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrgsController],
      providers: [
        { provide: OrgsService, useValue: mockOrgsService },
        { provide: OrgPeopleService, useValue: mockOrgPeopleService },
      ],
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
    uploadLogoMock.mockReset();
    deleteLogoMock.mockReset();
    listPeopleMock.mockReset();
    listDeletedPeopleMock.mockReset();
    removePersonMock.mockReset();
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
        sector: "CHURCH",
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
        sector: "CHURCH",
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
        parentPortalEnabled: true,
      } as unknown as Awaited<ReturnType<OrgsService["updateCurrentOrg"]>>);
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
        parentPortalEnabled: true,
      });
    });

    it("should allow an admin to update the parent portal setting", async () => {
      const req = { authUserId: "user-1" } as unknown as Parameters<
        OrgsController["updateCurrent"]
      >[1];
      updateCurrentOrgMock.mockResolvedValue({
        id: "org-1",
        name: "Org Name",
        slug: "acme",
        parentPortalEnabled: false,
      } as unknown as Awaited<ReturnType<OrgsService["updateCurrentOrg"]>>);

      const result = await controller.updateCurrent("org-1", req, {
        parentPortalEnabled: false,
      });

      expect(updateCurrentOrgMock).toHaveBeenCalledWith("org-1", {
        parentPortalEnabled: false,
      });
      expect(result).toEqual({
        id: "org-1",
        name: "Org Name",
        slug: "acme",
        parentPortalEnabled: false,
      });
    });

    it("should reject an empty org update payload", async () => {
      const req = { authUserId: "user-1" } as unknown as Parameters<
        OrgsController["updateCurrent"]
      >[1];

      await expect(controller.updateCurrent("org-1", req, {})).rejects.toThrow(
        BadRequestException,
      );

      expect(updateCurrentOrgMock).not.toHaveBeenCalled();
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

  describe("uploadCurrentLogo", () => {
    it("delegates to OrgsService.uploadLogo for an ORG_ADMIN", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["uploadCurrentLogo"]
      >[1];
      uploadLogoMock.mockResolvedValue({ logoUrl: "https://cdn.test/logo.png" });

      const result = await controller.uploadCurrentLogo("org-1", req, {
        logoBase64: "ZmFrZQ==",
        logoContentType: "image/png",
      });

      expect(uploadLogoMock).toHaveBeenCalledWith(
        "org-1",
        "ZmFrZQ==",
        "image/png",
      );
      expect(result).toEqual({ logoUrl: "https://cdn.test/logo.png" });
    });

    it("rejects a caller who is not an ORG_ADMIN", async () => {
      mockPrisma.orgMembership.findFirst.mockResolvedValueOnce(null);
      mockPrisma.userOrgRole.findFirst.mockResolvedValueOnce(null);
      const req = { authUserId: "not-admin" } as unknown as Parameters<
        OrgsController["uploadCurrentLogo"]
      >[1];

      await expect(
        controller.uploadCurrentLogo("org-1", req, {
          logoBase64: "ZmFrZQ==",
        }),
      ).rejects.toThrow();
      expect(uploadLogoMock).not.toHaveBeenCalled();
    });

    it("rejects an empty body", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["uploadCurrentLogo"]
      >[1];

      await expect(
        controller.uploadCurrentLogo("org-1", req, {}),
      ).rejects.toThrow();
      expect(uploadLogoMock).not.toHaveBeenCalled();
    });
  });

  describe("deleteCurrentLogo", () => {
    it("delegates to OrgsService.deleteLogo for an ORG_ADMIN", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["deleteCurrentLogo"]
      >[1];
      deleteLogoMock.mockResolvedValue({ logoUrl: null });

      const result = await controller.deleteCurrentLogo("org-1", req);

      expect(deleteLogoMock).toHaveBeenCalledWith("org-1");
      expect(result).toEqual({ logoUrl: null });
    });
  });

  describe("listPeople", () => {
    it("delegates active people listing to OrgPeopleService", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["listPeople"]
      >[1];
      listPeopleMock.mockResolvedValue([
        {
          id: "staff-user",
          name: "Staff User",
          displayName: "Staff User",
          email: "staff@example.test",
          orgRole: "ORG_MEMBER",
          siteAccessSummary: { allSites: false, siteCount: 1 },
        },
      ]);

      const result = await controller.listPeople("org-1", req);

      expect(result).toEqual([
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
      expect(listPeopleMock).toHaveBeenCalledWith("org-1", "admin-user");
    });
  });

  describe("listDeletedPeople", () => {
    it("delegates deleted people listing to OrgPeopleService", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["listDeletedPeople"]
      >[1];
      const deletedAt = new Date("2026-06-19T09:00:00.000Z");
      listDeletedPeopleMock.mockResolvedValue([
        {
          id: "deleted-1",
          userId: "staff-user",
          name: "Staff User",
          displayName: "Staff User",
          email: "staff@example.test",
          priorOrgRole: "ORG_MEMBER",
          priorSiteCount: 1,
          deletedAt,
          deletedByUserId: "admin-user",
        },
      ]);

      const result = await controller.listDeletedPeople("org-1", req);

      expect(result).toEqual([
        {
          id: "deleted-1",
          userId: "staff-user",
          name: "Staff User",
          displayName: "Staff User",
          email: "staff@example.test",
          priorOrgRole: "ORG_MEMBER",
          priorSiteCount: 1,
          deletedAt,
          deletedByUserId: "admin-user",
        },
      ]);
      expect(listDeletedPeopleMock).toHaveBeenCalledWith(
        "org-1",
        "admin-user",
      );
    });
  });

  describe("removePerson", () => {
    it("delegates person removal to OrgPeopleService", async () => {
      const req = { authUserId: "admin-user" } as unknown as Parameters<
        OrgsController["removePerson"]
      >[2];
      const deletedAt = new Date("2026-06-19T09:00:00.000Z");
      removePersonMock.mockResolvedValue({
        id: "deleted-1",
        userId: "staff-user",
        name: "Staff User",
        displayName: "Staff User",
        email: "staff@example.test",
        priorOrgRole: "ORG_MEMBER",
        priorSiteCount: 1,
        deletedAt,
        deletedByUserId: "admin-user",
      });

      const result = await controller.removePerson("org-1", "staff-user", req);

      expect(result).toEqual(
        expect.objectContaining({
          id: "deleted-1",
          userId: "staff-user",
        }),
      );
      expect(removePersonMock).toHaveBeenCalledWith(
        "org-1",
        "staff-user",
        "admin-user",
      );
    });
  });
});
