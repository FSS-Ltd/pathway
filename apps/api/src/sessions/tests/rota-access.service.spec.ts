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
  let assignment: Lookup;
  let user: Lookup;

  beforeEach(async () => {
    jest.resetModules();
    siteMembership = jest.fn().mockResolvedValue(null);
    orgMembership = jest.fn().mockResolvedValue(null);
    legacyOrgRole = jest.fn().mockResolvedValue(null);
    fixedRole = jest.fn().mockResolvedValue(null);
    assignment = jest.fn().mockResolvedValue(null);
    user = jest.fn().mockResolvedValue(null);
    jest.doMock("@pathway/db", () => ({
      getSystemRoleId: (orgId: string, tenantId: string | null, key: string) =>
        `${orgId}:${tenantId ?? "org"}:${key}`,
      OrgRole: { ORG_ADMIN: "ORG_ADMIN" },
      SiteRole: { SITE_ADMIN: "SITE_ADMIN", STAFF: "STAFF" },
      Role: {
        ADMIN: "ADMIN",
        COORDINATOR: "COORDINATOR",
        TEACHER: "TEACHER",
        LEAD: "LEAD",
        SUPPORT: "SUPPORT",
      },
      prisma: {
        siteMembership: { findFirst: siteMembership },
        orgMembership: { findFirst: orgMembership },
        userOrgRole: { findFirst: legacyOrgRole },
        userRoleAssignment: { findFirst: fixedRole },
        assignment: { findFirst: assignment },
        user: { findFirst: user },
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

  it("shows a session only to its assigned staff member or manager", async () => {
    await expect(
      service.assertSessionVisible(actor, "session-1"),
    ).rejects.toMatchObject({
      status: 404,
    });
    expect(assignment).toHaveBeenCalledWith({
      where: {
        sessionId: "session-1",
        userId: actor.userId,
        session: { tenantId: actor.tenantId },
      },
      select: { id: true },
    });

    assignment.mockResolvedValueOnce({ id: "assignment-1" });
    await expect(
      service.assertSessionVisible(actor, "session-1"),
    ).resolves.toBeUndefined();

    siteMembership.mockResolvedValue({ id: "site-admin" });
    assignment.mockClear();
    await expect(
      service.assertSessionVisible(actor, "session-1"),
    ).resolves.toBeUndefined();
    expect(assignment).not.toHaveBeenCalled();
  });

  it("allows active site staff and fixed managers to read the team rota", async () => {
    user.mockResolvedValue({ id: actor.userId });
    await expect(service.assertTeamViewer(actor)).resolves.toBeUndefined();
    expect(user).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: actor.userId,
        isActive: true,
        OR: expect.any(Array),
      }),
      select: { id: true },
    });

    user.mockClear();
    fixedRole.mockResolvedValue({ id: "head" });
    await expect(service.assertTeamViewer(actor)).resolves.toBeUndefined();
    expect(user).toHaveBeenCalledTimes(1);
  });

  it("denies inactive users and non-staff site viewers", async () => {
    await expect(service.assertTeamViewer(actor)).rejects.toMatchObject({
      status: 403,
    });
    expect(siteMembership).not.toHaveBeenCalled();

    user
      .mockResolvedValueOnce({ id: actor.userId })
      .mockResolvedValueOnce(null);
    await expect(service.assertTeamViewer(actor)).rejects.toMatchObject({
      status: 403,
    });
    expect(user).toHaveBeenLastCalledWith({
      where: expect.objectContaining({
        id: actor.userId,
        OR: expect.arrayContaining([
          expect.objectContaining({
            siteMemberships: {
              some: {
                tenantId: actor.tenantId,
                role: { in: ["STAFF", "SITE_ADMIN"] },
              },
            },
          }),
        ]),
      }),
      select: { id: true },
    });
  });
});
