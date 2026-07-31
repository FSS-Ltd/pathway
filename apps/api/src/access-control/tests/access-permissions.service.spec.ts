import { AccessPermissionsService } from "../access-permissions.service";
import type { RoleActorContext, RolesTransactionBoundary } from "../roles.service";

const actor: RoleActorContext = {
  orgId: "org-1",
  tenantId: "site-1",
  userId: "actor-1",
  legacyOrgRoles: ["org:admin"],
  requestId: "access-permissions-request-1",
};

function serviceWith(tx: object) {
  const transaction: RolesTransactionBoundary = {
    run: async (_actor, operation) => operation(tx as never),
  };
  return new AccessPermissionsService(transaction);
}

describe("AccessPermissionsService", () => {
  it("denies an actor who lacks permissions-read authority", async () => {
    const service = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "STAFF" }) },
    });

    await expect(service.listDelegableKeys(actor)).rejects.toMatchObject({
      response: { statusCode: 403, code: "PERMISSIONS_API_ACCESS_DENIED" },
    });
  });

  it("returns only active, delegable, org-enabled keys", async () => {
    const service = serviceWith({
      orgMembership: { findUnique: jest.fn().mockResolvedValue({ role: "ORG_ADMIN" }) },
      permissionDefinition: {
        findUnique: jest.fn().mockResolvedValue({ isActive: true }),
        findMany: jest.fn().mockResolvedValue([
          { key: "ace.pace.read", delegable: true, isActive: true },
          { key: "ace.pace.record", delegable: false, isActive: true },
          { key: "platform.access.roles.manage", delegable: false, isActive: true },
        ]),
      },
      orgVertical: { findUnique: jest.fn().mockResolvedValue({ vertical: "ACE_SCHOOL" }) },
      orgModule: { findMany: jest.fn().mockResolvedValue([]) },
    });

    await expect(service.listDelegableKeys(actor)).resolves.toEqual([
      "ace.pace.read",
    ]);
  });
});
