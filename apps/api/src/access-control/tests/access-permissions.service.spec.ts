import { AccessPermissionsService } from "../access-permissions.service";
import type { EffectivePermissionsService } from "../effective-permissions.service";
import type { RoleActorContext, RolesTransactionBoundary } from "../roles.service";

const actor: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "actor-1",
  legacyOrgRoles: ["org:admin"],
  requestId: "access-permissions-request-1",
};

function serviceWith(tx: object, actorPermissionKeys: string[] = []) {
  const transaction: RolesTransactionBoundary = {
    run: async (_actor, operation) => operation(tx as never),
  };
  const effectivePermissions = {
    listForUser: jest.fn().mockResolvedValue(actorPermissionKeys),
  } as unknown as EffectivePermissionsService;
  return new AccessPermissionsService(transaction, effectivePermissions);
}

describe("AccessPermissionsService", () => {
  it("returns only keys that are active, delegable, org-enabled, and held by the actor", async () => {
    const service = serviceWith(
      {
        permissionDefinition: {
          findMany: jest.fn().mockResolvedValue([
            { key: "ace.pace.read", delegable: true, isActive: true },
            { key: "ace.pace.record", delegable: false, isActive: true },
            { key: "ace.behaviour.read", delegable: true, isActive: true },
            { key: "platform.access.roles.manage", delegable: false, isActive: true },
          ]),
        },
        orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
        orgModule: { findMany: jest.fn().mockResolvedValue([]) },
      },
      ["ace.pace.read"],
    );

    await expect(service.listDelegableKeys(actor)).resolves.toEqual([
      "ace.pace.read",
    ]);
  });
});
