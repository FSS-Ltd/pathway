import { Av30ActivityService } from "../av30-activity.service";
import { PathwayRequestContext, UserTenantRole } from "@pathway/auth";
import { prisma } from "@pathway/db";
import { Av30ActivityType } from "@pathway/types/av30";
import type { AuthContext } from "@pathway/auth/src/types/auth-context";
import type { Request } from "express";

// Mock Prisma
jest.mock("@pathway/db", () => ({
  prisma: {
    staffActivity: {
      create: jest.fn(),
    },
  },
}));

describe("Av30ActivityService", () => {
  let service: Av30ActivityService;
  let mockContext: PathwayRequestContext;

  const createMockContext = (
    overrides: Partial<AuthContext> = {},
  ): PathwayRequestContext => {
    const context: AuthContext = {
      user: {
        userId: "user-123",
        email: "staff@example.com",
        authProvider: "auth0",
      },
      org: {
        orgId: "org-123",
      },
      tenant: {
        tenantId: "tenant-123",
        orgId: "org-123",
      },
      roles: {
        org: [],
        tenant: [UserTenantRole.TEACHER],
      },
      permissions: [],
      rawClaims: {},
      ...overrides,
    };

    const mockRequest = {} as unknown as Request;
    const ctx = new PathwayRequestContext(mockRequest);
    ctx.setContext(context);
    return ctx;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockContext = createMockContext();
    service = new Av30ActivityService();
  });

  describe("recordActivityForCurrentUser", () => {
    it("records activity for staff user", async () => {
      const mockCreate = prisma.staffActivity.create as jest.Mock;
      mockCreate.mockResolvedValue({ id: "activity-123" });

      await service.recordActivityForCurrentUser(
        mockContext,
        Av30ActivityType.ATTENDANCE_RECORDED,
      );

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          tenantId: "tenant-123",
          orgId: "org-123",
          staffUserId: "user-123",
          activityType: Av30ActivityType.ATTENDANCE_RECORDED,
          occurredAt: expect.any(Date),
        },
      });
    });

    it("skips recording for parent users", async () => {
      const parentContext = createMockContext({
        roles: {
          org: [],
          tenant: [UserTenantRole.PARENT],
        },
      });

      const mockCreate = prisma.staffActivity.create as jest.Mock;

      await service.recordActivityForCurrentUser(
        parentContext,
        Av30ActivityType.ATTENDANCE_RECORDED,
      );

      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("uses provided occurredAt timestamp", async () => {
      const mockCreate = prisma.staffActivity.create as jest.Mock;
      const occurredAt = new Date("2024-01-15T10:00:00Z");

      await service.recordActivityForCurrentUser(
        mockContext,
        Av30ActivityType.ATTENDANCE_RECORDED,
        occurredAt,
      );

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          tenantId: "tenant-123",
          orgId: "org-123",
          staffUserId: "user-123",
          activityType: Av30ActivityType.ATTENDANCE_RECORDED,
          occurredAt,
        },
      });
    });
  });

  describe("recordActivity", () => {
    it("records activity for specified staff user", async () => {
      const mockCreate = prisma.staffActivity.create as jest.Mock;
      mockCreate.mockResolvedValue({ id: "activity-123" });

      await service.recordActivity(mockContext, {
        activityType: Av30ActivityType.ASSIGNMENT_PUBLISHED,
        staffUserId: "staff-user-456",
        occurredAt: new Date("2024-01-15T10:00:00Z"),
      });

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          tenantId: "tenant-123",
          orgId: "org-123",
          staffUserId: "staff-user-456",
          activityType: Av30ActivityType.ASSIGNMENT_PUBLISHED,
          occurredAt: new Date("2024-01-15T10:00:00Z"),
        },
      });
    });

    it("throws error if context missing tenantId", async () => {
      const emptyContext = new PathwayRequestContext(
        {} as unknown as Request,
      );

      await expect(
        service.recordActivity(emptyContext, {
          activityType: Av30ActivityType.ATTENDANCE_RECORDED,
          staffUserId: "user-123",
        }),
      ).rejects.toThrow("PathwayRequestContext must have tenantId and orgId");
    });

    it("throws error if context missing orgId", async () => {
      const contextWithoutOrg = createMockContext({
        org: {
          orgId: "",
        },
      });

      await expect(
        service.recordActivity(contextWithoutOrg, {
          activityType: Av30ActivityType.ATTENDANCE_RECORDED,
          staffUserId: "user-123",
        }),
      ).rejects.toThrow("PathwayRequestContext must have tenantId and orgId");
    });
  });
});
