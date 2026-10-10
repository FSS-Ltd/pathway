import "reflect-metadata";
import { SELF_DECLARED_DEPS_METADATA } from "@nestjs/common/constants";
import { ActiveSiteController } from "../active-site.controller";
import { UserRolesService } from "../user-roles.service";

jest.mock("@pathway/db", () => ({
  OrgRole: { ORG_ADMIN: "ORG_ADMIN", ORG_BILLING: "ORG_BILLING" },
  SiteRole: { SITE_ADMIN: "SITE_ADMIN", STAFF: "STAFF" },
  prisma: {
    siteMembership: { findMany: jest.fn() },
    orgMembership: { findMany: jest.fn() },
    user: { findUnique: jest.fn(), update: jest.fn() },
    tenant: { findMany: jest.fn() },
    guardianChildRelationship: { findMany: jest.fn() },
  },
}));

import { prisma } from "@pathway/db";
const siteMembershipFindMany = prisma.siteMembership
  .findMany as unknown as jest.Mock;
const orgMembershipFindMany = prisma.orgMembership
  .findMany as unknown as jest.Mock;
const userFindUnique = prisma.user.findUnique as unknown as jest.Mock;
const guardianRelationshipFindMany = prisma.guardianChildRelationship
  .findMany as unknown as jest.Mock;

type DeclaredDependency = {
  index: number;
  param: unknown;
};

describe("ActiveSiteController", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    guardianRelationshipFindMany.mockResolvedValue([]);
  });

  it("lists a guardian site without adding a staff membership", async () => {
    siteMembershipFindMany.mockResolvedValue([]);
    orgMembershipFindMany.mockResolvedValue([]);
    guardianRelationshipFindMany.mockResolvedValue([
      {
        tenant: {
          id: "site-a",
          name: "School",
          orgId: "org-a",
          timezone: "Europe/London",
          org: { name: "Organisation", slug: "org" },
        },
      },
    ]);
    userFindUnique.mockResolvedValue({ lastActiveTenantId: "site-a" });
    const controller = new ActiveSiteController(new UserRolesService());
    const result = await controller.getActiveSite(
      { authUserId: "guardian-a", cookies: {} } as unknown as Parameters<
        ActiveSiteController["getActiveSite"]
      >[0],
      { cookie: jest.fn() } as unknown as Parameters<
        ActiveSiteController["getActiveSite"]
      >[1],
    );
    expect(result.sites).toEqual([
      expect.objectContaining({ id: "site-a", role: null }),
    ]);
    expect(guardianRelationshipFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          guardianIdentity: {
            userId: "guardian-a",
            user: { isActive: true },
          },
          legalAccess: "FULL",
          revokedAt: null,
        }),
      }),
    );
  });

  it("declares UserRolesService as an explicit constructor dependency", () => {
    const dependencies = Reflect.getMetadata(
      SELF_DECLARED_DEPS_METADATA,
      ActiveSiteController,
    ) as DeclaredDependency[] | undefined;

    expect(dependencies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 0,
          param: UserRolesService,
        }),
      ]),
    );
  });

  it("synchronises cookies with the verified active site before scoped reads", async () => {
    const siteMemberships = [
      {
        tenantId: "site-a",
        role: "STAFF",
        tenant: {
          name: "A",
          orgId: "org-a",
          timezone: "Europe/London",
          org: { name: "A", slug: "a" },
        },
      },
      {
        tenantId: "site-b",
        role: "STAFF",
        tenant: {
          name: "B",
          orgId: "org-b",
          timezone: "Europe/London",
          org: { name: "B", slug: "b" },
        },
      },
    ];
    siteMembershipFindMany.mockResolvedValue(siteMemberships);
    orgMembershipFindMany.mockResolvedValue([]);
    userFindUnique.mockResolvedValue({
      lastActiveTenantId: "site-b",
    });
    const cookie = jest.fn();
    const controller = new ActiveSiteController(new UserRolesService());
    // The controller only reads these Request fields; the rest belong to Express.
    const request = {
      authUserId: "user",
      cookies: { pw_active_site_id: "site-a" },
    } as unknown as Parameters<ActiveSiteController["getActiveSite"]>[0];
    const result = await controller.getActiveSite(request, {
      cookie,
    } as unknown as Parameters<ActiveSiteController["getActiveSite"]>[1]);

    expect(result.activeSiteId).toBe("site-b");
    expect(cookie).toHaveBeenCalledWith(
      "pw_active_site_id",
      "site-b",
      expect.objectContaining({ httpOnly: true }),
    );
    expect(cookie).toHaveBeenCalledWith(
      "pw_active_org_id",
      "org-b",
      expect.objectContaining({ httpOnly: true }),
    );
  });
});
