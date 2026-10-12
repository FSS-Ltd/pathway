import type { Prisma } from "@pathway/db";
import { AccessUsersService } from "../access-users.service";
import { EffectivePermissionsService } from "../effective-permissions.service";
import type { RolesTransactionBoundary } from "../roles.service";

describe("access directory", () => {
  it("returns a bounded page and a cursor without invitations", async () => {
    const findMany = jest.fn().mockResolvedValue([
      {
        userId: "a",
        user: {
          id: "a",
          name: "A",
          displayName: null,
          email: "a@example.com",
          isActive: true,
          superUser: false,
          hasFamilyAccess: false,
        },
        role: "STAFF",
      },
      {
        userId: "b",
        user: {
          id: "b",
          name: "B",
          displayName: null,
          email: "b@example.com",
          isActive: true,
          superUser: false,
          hasFamilyAccess: false,
        },
        role: "STAFF",
      },
    ]);
    const findAssignments = jest
      .fn()
      .mockResolvedValue([{ userId: "a", roleDefinitionId: "role-1" }]);
    const transaction: RolesTransactionBoundary = {
      run: async (_actor, operation) =>
        operation({
          orgMembership: { findMany },
          userRoleAssignment: { findMany: findAssignments },
        } as unknown as Prisma.TransactionClient),
    };
    const effective = {} as EffectivePermissionsService;
    const service = new AccessUsersService(transaction, effective);
    const result = await service.listDirectory(
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "head-1",
        legacyOrgRoles: [],
        requestId: "r1",
      },
      { limit: 1 },
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.roleDefinitionIds).toEqual(["role-1"]);
    expect(result.nextCursor).toBe("a");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 2 }));
    expect(findAssignments).toHaveBeenCalledTimes(1);
  });
});
