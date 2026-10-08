import { Logger } from "@nestjs/common";
import {
  type UserRolesResponse,
  UserRolesService,
} from "../user-roles.service";

jest.mock("@pathway/db", () => ({
  OrgRole: {
    ORG_ADMIN: "ORG_ADMIN",
    ORG_BILLING: "ORG_BILLING",
    ORG_MEMBER: "ORG_MEMBER",
  },
  Role: {
    ADMIN: "ADMIN",
    COORDINATOR: "COORDINATOR",
    TEACHER: "TEACHER",
    PARENT: "PARENT",
  },
  SiteRole: {
    SITE_ADMIN: "SITE_ADMIN",
    STAFF: "STAFF",
    VIEWER: "VIEWER",
  },
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    orgMembership: {
      findMany: jest.fn(),
    },
    siteMembership: {
      findMany: jest.fn(),
    },
    userOrgRole: {
      findMany: jest.fn(),
    },
    userTenantRole: {
      findMany: jest.fn(),
    },
    child: {
      count: jest.fn(),
    },
  },
}));

import { prisma } from "@pathway/db";

const userFindUnique = prisma.user.findUnique as unknown as jest.Mock;
const orgMembershipFindMany = prisma.orgMembership.findMany as unknown as jest.Mock;
const siteMembershipFindMany = prisma.siteMembership.findMany as unknown as jest.Mock;
const userOrgRoleFindMany = prisma.userOrgRole.findMany as unknown as jest.Mock;
const userTenantRoleFindMany = prisma.userTenantRole.findMany as unknown as jest.Mock;
const childCount = prisma.child.count as unknown as jest.Mock;

describe("UserRolesService", () => {
  let service: UserRolesService;
  let loggerWarn: jest.SpyInstance;
  let loggerError: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    loggerWarn = jest
      .spyOn(Logger.prototype, "warn")
      .mockImplementation(() => undefined);
    loggerError = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => undefined);
    service = new UserRolesService();
    childCount.mockResolvedValue(0);
  });

  afterEach(() => {
    loggerWarn.mockRestore();
    loggerError.mockRestore();
  });

  it("builds the superuser role response from current memberships", async () => {
    userFindUnique.mockResolvedValue({
      superUser: true,
      isActive: true,
      hasFamilyAccess: true,
      hasServeAccess: true,
      lastActiveTenantId: "tenant-1",
    });
    orgMembershipFindMany.mockResolvedValue([
      {
        orgId: "org-1",
        role: "ORG_ADMIN",
        org: { id: "org-1", name: "Victorious Kids", isMasterOrg: true },
      },
    ]);
    siteMembershipFindMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        role: "SITE_ADMIN",
        tenant: { id: "tenant-1", name: "Victorious Kids", orgId: "org-1" },
      },
    ]);
    userOrgRoleFindMany.mockResolvedValue([
      {
        orgId: "org-1",
        role: "ORG_ADMIN",
        org: { id: "org-1", name: "Victorious Kids", isMasterOrg: true },
      },
    ]);
    userTenantRoleFindMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        role: "ADMIN",
        tenant: { id: "tenant-1", name: "Victorious Kids", orgId: "org-1" },
      },
    ]);

    await expect(
      service.getUserRoles("user-super", {
        activeOrgId: "org-1",
        activeSiteId: "tenant-1",
      }),
    ).resolves.toEqual({
      userId: "user-super",
      superUser: true,
      currentOrgIsMasterOrg: true,
      orgRoles: [{ orgId: "org-1", role: "ORG_ADMIN" }],
      siteRoles: [{ tenantId: "tenant-1", role: "SITE_ADMIN" }],
      orgMemberships: [
        { orgId: "org-1", orgName: "Victorious Kids", role: "ORG_ADMIN" },
      ],
      siteMemberships: [
        {
          tenantId: "tenant-1",
          tenantName: "Victorious Kids",
          orgId: "org-1",
          role: "SITE_ADMIN",
        },
      ],
      hasFamilyAccess: true,
      hasServeAccess: true,
    });
  });

  it("keeps normal staff users scoped to staff-level site access", async () => {
    userFindUnique.mockResolvedValue({
      superUser: false,
      hasFamilyAccess: false,
      hasServeAccess: true,
      lastActiveTenantId: "tenant-1",
    });
    orgMembershipFindMany.mockResolvedValue([]);
    siteMembershipFindMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        role: "STAFF",
        tenant: { id: "tenant-1", name: "Victorious Kids", orgId: "org-1" },
      },
    ]);
    userOrgRoleFindMany.mockResolvedValue([]);
    userTenantRoleFindMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        role: "TEACHER",
        tenant: { id: "tenant-1", name: "Victorious Kids", orgId: "org-1" },
      },
    ]);

    await expect(service.getUserRoles("user-staff")).resolves.toMatchObject({
      userId: "user-staff",
      superUser: false,
      currentOrgIsMasterOrg: false,
      orgRoles: [],
      siteRoles: [{ tenantId: "tenant-1", role: "STAFF" }],
      orgMemberships: [],
      siteMemberships: [
        {
          tenantId: "tenant-1",
          tenantName: "Victorious Kids",
          orgId: "org-1",
          role: "STAFF",
        },
      ],
      hasFamilyAccess: false,
      hasServeAccess: true,
    });
  });

  it.each([true, false])(
    "returns the legacy evaluator's %s result for the resolved role response",
    async (expectedDecision) => {
      userFindUnique.mockResolvedValue({
        superUser: false,
        hasFamilyAccess: false,
        hasServeAccess: true,
        lastActiveTenantId: "tenant-1",
      });
      orgMembershipFindMany.mockResolvedValue([]);
      siteMembershipFindMany.mockResolvedValue([
        {
          tenantId: "tenant-1",
          role: "STAFF",
          tenant: {
            id: "tenant-1",
            name: "Victorious Kids",
            orgId: "org-1",
          },
        },
      ]);
      userOrgRoleFindMany.mockResolvedValue([]);
      userTenantRoleFindMany.mockResolvedValue([]);
      const evaluator = jest.fn<boolean, [UserRolesResponse]>((roles) => {
        expect(roles).toMatchObject({
          userId: "user-staff",
          siteRoles: [{ tenantId: "tenant-1", role: "STAFF" }],
          hasServeAccess: true,
        });
        return expectedDecision;
      });

      await expect(
        service.evaluateLegacyAccess("user-staff", evaluator, {
          activeSiteId: "tenant-1",
        }),
      ).resolves.toBe(expectedDecision);

      expect(evaluator).toHaveBeenCalledTimes(1);
    },
  );

  it("returns roles when linked-child access derivation fails", async () => {
    userFindUnique.mockResolvedValue({
      superUser: false,
      hasFamilyAccess: false,
      hasServeAccess: false,
      lastActiveTenantId: "tenant-1",
    });
    orgMembershipFindMany.mockResolvedValue([]);
    siteMembershipFindMany.mockResolvedValue([
      {
        tenantId: "tenant-1",
        role: "STAFF",
        tenant: { id: "tenant-1", name: "Victorious Kids", orgId: "org-1" },
      },
    ]);
    userOrgRoleFindMany.mockResolvedValue([]);
    userTenantRoleFindMany.mockResolvedValue([]);
    childCount.mockRejectedValueOnce(new Error("relation lookup failed"));

    await expect(
      service.getUserRoles("user-staff", {
        activeSiteId: "tenant-1",
        route: "GET /auth/active-site/roles",
      }),
    ).resolves.toMatchObject({
      userId: "user-staff",
      siteRoles: [{ tenantId: "tenant-1", role: "STAFF" }],
      hasFamilyAccess: false,
      hasServeAccess: true,
    });

    expect(loggerWarn).toHaveBeenCalledWith(
      expect.objectContaining({
        route: "GET /auth/active-site/roles",
        operation: "child.countLinkedGuardians",
        hasActiveOrgId: false,
        hasActiveSiteId: true,
        errorMessage: "relation lookup failed",
      }),
    );
    expect(loggerWarn.mock.calls[0][0]).not.toHaveProperty("userId");
    expect(loggerWarn.mock.calls[0][0]).not.toHaveProperty("activeSiteId");
  });
});
