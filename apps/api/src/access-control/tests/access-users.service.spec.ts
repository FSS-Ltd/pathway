import { AccessUsersService } from "../access-users.service";
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
    listForUser: jest.fn().mockResolvedValue(["ace.pace.read"]),
  } as unknown as EffectivePermissionsService;
  return {
    effectivePermissions,
    service: new AccessUsersService(transaction, effectivePermissions),
  };
}

const allowedTx = {
  orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
  orgModule: { findMany: jest.fn().mockResolvedValue([]) },
  userRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
};

describe("AccessUsersService", () => {
  it("returns the effective permissions and sources for a target user", async () => {
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

  it("returns the target user's membership, active assignments, and organisation capabilities", async () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const tx = {
      ...allowedTx,
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_ADMIN" }) },
      userRoleAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "assignment-1",
            tenantId: null,
            startsAt: new Date("2026-07-01T00:00:00.000Z"),
            expiresAt: null,
            roleDefinition: {
              id: "role-1",
              name: "Organisation Head",
              scope: "organisation",
            },
          },
        ]),
      },
    };
    const { service } = serviceWith(tx);
    jest.useFakeTimers().setSystemTime(now);

    try {
      await expect(
        service.getAccessSummary("target-user", actor),
      ).resolves.toEqual({
        userId: "target-user",
        orgId: "org-1",
        tenantId: "site-1",
        organisationMembership: { role: "ORG_ADMIN" },
        assignments: [
          {
            id: "assignment-1",
            roleDefinitionId: "role-1",
            roleName: "Organisation Head",
            scope: "organisation",
            tenantId: null,
            startsAt: new Date("2026-07-01T00:00:00.000Z"),
            expiresAt: null,
            isActive: true,
          },
        ],
        organisationCapabilities: expect.arrayContaining(["ace.pace.read"]),
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("returns the actor's own effective permissions without any bootstrap check", async () => {
    const { effectivePermissions, service } = serviceWith({});

    await expect(service.listOwnPermissions(actor)).resolves.toEqual([
      "ace.pace.read",
    ]);
    expect(effectivePermissions.listForUser).toHaveBeenCalledWith(
      "actor-1",
      "org-1",
      "site-1",
    );
  });
});
