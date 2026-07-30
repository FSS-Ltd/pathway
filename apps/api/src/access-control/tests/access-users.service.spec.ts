import { AccessUsersService } from "../access-users.service";
import { AccessShadowService } from "../access-shadow.service";
import { EffectivePermissionsService } from "../effective-permissions.service";
import type { RoleActorContext, RolesTransactionBoundary } from "../roles.service";

const actor: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "actor-1",
  legacyOrgRoles: ["org:admin"],
  requestId: "access-users-request-1",
};

function serviceWith(tx: object) {
  const transaction: RolesTransactionBoundary = {
    run: async (_actor, operation) => operation(tx as never),
  };
  const effectivePermissions = {
    listForUserWithSources: jest.fn().mockResolvedValue([
      { permissionKey: "ace.pace.read", sourceRoleIds: ["role-1"] },
    ]),
  } as unknown as EffectivePermissionsService;
  const shadow = {
    compare: jest.fn().mockResolvedValue(true),
  } as unknown as AccessShadowService;
  return {
    effectivePermissions,
    shadow,
    service: new AccessUsersService(transaction, effectivePermissions, shadow),
  };
}

const allowedTx = {
  orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_ADMIN" }) },
  permissionDefinition: { findUnique: jest.fn().mockResolvedValue({ isActive: true }) },
  orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
  orgModule: { findMany: jest.fn().mockResolvedValue([]) },
};

describe("AccessUsersService", () => {
  it("returns the effective permissions and sources for an authorised actor", async () => {
    const { effectivePermissions, service } = serviceWith(allowedTx);

    await expect(
      service.getEffectivePermissions("target-user", actor),
    ).resolves.toEqual({
      userId: "target-user",
      orgId: "org-1",
      tenantId: "site-1",
      permissions: [{ permissionKey: "ace.pace.read", sourceRoleIds: ["role-1"] }],
    });
    expect(effectivePermissions.listForUserWithSources).toHaveBeenCalledWith(
      "target-user",
      "org-1",
      "site-1",
    );
  });

  it("records a shadow comparison for the fixed effective-permissions route", async () => {
    const { shadow, service } = serviceWith(allowedTx);

    await service.getEffectivePermissions("target-user", actor);

    expect(shadow.compare).toHaveBeenCalledWith({
      route: "GET /access/users/:userId/effective-permissions",
      legacyAllowed: true,
      request: expect.objectContaining({
        userId: "target-user",
        orgId: "org-1",
        tenantId: "site-1",
        permission: "platform.access.users.read",
      }),
    });
  });

  it("denies an actor who is not a legacy organisation admin", async () => {
    const { service } = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "STAFF" }) },
    });

    await expect(
      service.getEffectivePermissions("target-user", actor),
    ).rejects.toMatchObject({
      response: { statusCode: 403, code: "EFFECTIVE_ACCESS_API_ACCESS_DENIED" },
    });
  });

  it("denies an actor whose users.read permission is inactive or unavailable", async () => {
    const { service } = serviceWith({
      ...allowedTx,
      permissionDefinition: { findUnique: jest.fn().mockResolvedValue({ isActive: false }) },
    });

    await expect(
      service.getEffectivePermissions("target-user", actor),
    ).rejects.toMatchObject({
      response: { statusCode: 403, code: "EFFECTIVE_ACCESS_API_ACCESS_DENIED" },
    });
  });
});
