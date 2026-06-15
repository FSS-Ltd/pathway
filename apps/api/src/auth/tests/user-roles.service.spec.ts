import { UserRolesService } from "../user-roles.service";

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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UserRolesService();
    childCount.mockResolvedValue(0);
  });

  it("builds the superuser role response from current memberships", async () => {
    userFindUnique.mockResolvedValue({
      superUser: true,
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
});
