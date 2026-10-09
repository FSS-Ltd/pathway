import type { RotaActor, RotaAccessService } from "../rota-access.service";

type Identity = { id: string };
type Lookup = jest.Mock<Promise<Identity | null>, [unknown]>;

describe("RotaAccessService", () => {
  const actor: RotaActor = {
    userId: "staff-1",
    orgId: "org-1",
    tenantId: "site-1",
    isSuperUser: false,
  };
  let service: RotaAccessService;
  let siteMembership: Lookup;
  let orgMembership: Lookup;
  let legacyOrgRole: Lookup;
  let fixedRole: Lookup;

  beforeEach(async () => {
    jest.resetModules();
    siteMembership = jest.fn().mockResolvedValue(null);
    orgMembership = jest.fn().mockResolvedValue(null);
    legacyOrgRole = jest.fn().mockResolvedValue(null);
    fixedRole = jest.fn().mockResolvedValue(null);
    jest.doMock("@pathway/db", () => ({
      getSystemRoleId: (orgId: string, tenantId: string | null, key: string) =>
        `${orgId}:${tenantId ?? "org"}:${key}`,
      OrgRole: { ORG_ADMIN: "ORG_ADMIN" },
      SiteRole: { SITE_ADMIN: "SITE_ADMIN" },
      prisma: {
        siteMembership: { findFirst: siteMembership },
        orgMembership: { findFirst: orgMembership },
        userOrgRole: { findFirst: legacyOrgRole },
        userRoleAssignment: { findFirst: fixedRole },
      },
    }));
    const module = await import("../rota-access.service");
    service = new module.RotaAccessService();
  });

  it("denies a staff member without manager authority", async () => {
    expect(await service.canManage(actor)).toBe(false);
    await expect(service.assertManager(actor)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("accepts a current fixed head or site lead assignment", async () => {
    fixedRole.mockResolvedValue({ id: "fixed-role" });
    expect(await service.canManage(actor)).toBe(true);
    expect(fixedRole).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: actor.userId,
        orgId: actor.orgId,
        roleDefinitionId: {
          in: ["org-1:org:organisationHead", "org-1:site-1:siteLead"],
        },
        roleDefinition: { isSystem: true, isActive: true },
        revokedAt: null,
      }),
      select: { id: true },
    });
  });

  it("accepts a fixed site administrator and active superuser", async () => {
    siteMembership.mockResolvedValue({ id: "site-admin" });
    expect(await service.canManage(actor)).toBe(true);
    siteMembership.mockClear();
    expect(await service.canManage({ ...actor, isSuperUser: true })).toBe(true);
    expect(siteMembership).not.toHaveBeenCalled();
  });

  it("requires the trusted request to contain an actor and active site", async () => {
    const { rotaActorFromRequest } = await import("../rota-access.service");
    expect(() => rotaActorFromRequest({}, actor.orgId, actor.tenantId)).toThrow(
      "Active site and user required",
    );
    expect(() =>
      rotaActorFromRequest({ authUserId: actor.userId }, actor.orgId, ""),
    ).toThrow("Active site and user required");
  });
});
