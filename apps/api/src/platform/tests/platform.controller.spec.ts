import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  getOrgCapabilities,
  VERTICAL_CAPABILITIES,
  type Capability,
} from "@pathway/platform";
import { isModule, PlatformController } from "../platform.controller";

jest.mock("@pathway/db", () => ({
  Module: {
    FINANCE: "FINANCE",
    EVENTS: "EVENTS",
    TRANSPORT: "TRANSPORT",
    MEALS: "MEALS",
    ASSET_MANAGEMENT: "ASSET_MANAGEMENT",
    HR: "HR",
    AI_WORKSPACE: "AI_WORKSPACE",
    ADVANCED_REPORTING: "ADVANCED_REPORTING",
  },
  ModuleStatus: {
    ACTIVE: "ACTIVE",
    CANCELLED: "CANCELLED",
  },
  OrgRole: {
    ORG_ADMIN: "ORG_ADMIN",
  },
  prisma: {
    orgModule: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    orgMembership: {
      findFirst: jest.fn(),
    },
    userOrgRole: {
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@pathway/platform", () => ({
  getOrgCapabilities: jest.fn(),
  VERTICAL_CAPABILITIES: {
    CHURCH: ["attendance.read", "volunteers.manage"],
  },
}));

type MockPrisma = {
  orgModule: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
  orgMembership: {
    findFirst: jest.Mock;
  };
  userOrgRole: {
    findFirst: jest.Mock;
  };
};

const { prisma: mockPrisma } = jest.requireMock("@pathway/db") as {
  prisma: MockPrisma;
};

const mockGetOrgCapabilities = getOrgCapabilities as jest.MockedFunction<
  typeof getOrgCapabilities
>;

describe("PlatformController", () => {
  const previousNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = "test";
  });

  afterAll(() => {
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("returns the current organisation capabilities", async () => {
    const capabilities: Capability[] = ["finance.invoices", "finance.payments"];
    mockGetOrgCapabilities.mockResolvedValue(capabilities);
    const controller = new PlatformController();

    await expect(controller.capabilities("org-1")).resolves.toEqual({
      capabilities,
    });
    expect(mockGetOrgCapabilities).toHaveBeenCalledWith("org-1");
  });

  it("returns the selected vertical's capability preview", () => {
    const controller = new PlatformController();

    expect(controller.verticalCapabilities("CHURCH")).toEqual({
      capabilities: VERTICAL_CAPABILITIES.CHURCH,
    });
  });

  it("rejects an unknown vertical", () => {
    const controller = new PlatformController();

    expect(() => controller.verticalCapabilities("UNKNOWN")).toThrow(
      BadRequestException,
    );
  });

  it("recognises only known module values", () => {
    expect(isModule("FINANCE")).toBe(true);
    expect(isModule("UNKNOWN")).toBe(false);
    expect(isModule(null)).toBe(false);
  });

  it("lists module records for the current organisation", async () => {
    const rows = [
      {
        module: "FINANCE",
        status: "ACTIVE",
        activatedAt: new Date("2026-07-01T00:00:00.000Z"),
        expiresAt: null,
        metadata: { billingSource: "STRIPE" },
      },
    ];
    mockPrisma.orgModule.findMany.mockResolvedValue(rows);
    const controller = new PlatformController();

    await expect(controller.modules("org-1")).resolves.toEqual({
      modules: [
        {
          module: "FINANCE",
          status: "ACTIVE",
          activatedAt: new Date("2026-07-01T00:00:00.000Z"),
          expiresAt: null,
          billingSource: "STRIPE",
        },
      ],
    });
    expect(mockPrisma.orgModule.findMany).toHaveBeenCalledWith({
      where: { orgId: "org-1" },
      select: {
        module: true,
        status: true,
        activatedAt: true,
        expiresAt: true,
        metadata: true,
      },
    });
  });

  it("rejects direct module toggles in production before any write", async () => {
    process.env.NODE_ENV = "production";
    const controller = new PlatformController();

    await expect(
      controller.toggleModule(
        "org-1",
        { module: "FINANCE", active: true },
        { authUserId: "admin-1" },
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(mockPrisma.orgMembership.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.userOrgRole.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.orgModule.upsert).not.toHaveBeenCalled();
  });

  it("lets an organisation admin toggle a module outside production", async () => {
    const saved = {
      orgId: "org-1",
      module: "FINANCE",
      status: "ACTIVE",
    };
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      userId: "admin-1",
    });
    mockPrisma.orgModule.upsert.mockResolvedValue(saved);
    const controller = new PlatformController();

    await expect(
      controller.toggleModule(
        "org-1",
        { module: "FINANCE", active: true },
        { authUserId: "admin-1" },
      ),
    ).resolves.toEqual(saved);
    expect(mockPrisma.orgModule.upsert).toHaveBeenCalledWith({
      where: {
        orgId_module: {
          orgId: "org-1",
          module: "FINANCE",
        },
      },
      create: {
        orgId: "org-1",
        module: "FINANCE",
        status: "ACTIVE",
      },
      update: {
        status: "ACTIVE",
      },
    });
  });

  it("rejects an unknown module without writing", async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      userId: "admin-1",
    });
    const controller = new PlatformController();

    await expect(
      controller.toggleModule(
        "org-1",
        { module: "UNKNOWN", active: true },
        { authUserId: "admin-1" },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.orgModule.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean active value without writing", async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue({
      userId: "admin-1",
    });
    const controller = new PlatformController();

    await expect(
      controller.toggleModule(
        "org-1",
        { module: "FINANCE", active: "yes" },
        { authUserId: "admin-1" },
      ),
    ).rejects.toThrow(BadRequestException);
    expect(mockPrisma.orgModule.upsert).not.toHaveBeenCalled();
  });

  it("rejects a non-admin module toggle without writing", async () => {
    mockPrisma.orgMembership.findFirst.mockResolvedValue(null);
    mockPrisma.userOrgRole.findFirst.mockResolvedValue(null);
    const controller = new PlatformController();

    await expect(
      controller.toggleModule(
        "org-1",
        { module: "FINANCE", active: false },
        { authUserId: "member-1" },
      ),
    ).rejects.toThrow(UnauthorizedException);
    expect(mockPrisma.orgModule.upsert).not.toHaveBeenCalled();
  });
});
