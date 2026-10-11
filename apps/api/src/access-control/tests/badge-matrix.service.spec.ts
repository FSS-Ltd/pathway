import { AccessTagKey } from "@prisma/client";
import type { Prisma } from "@pathway/db";
import { BadgeMatrixService } from "../badge-matrix.service";
import { EffectivePermissionsService } from "../effective-permissions.service";
import type { RolesTransactionBoundary } from "../roles.service";

describe("BadgeMatrixService", () => {
  it("includes every badge and reports fixed-role coverage", async () => {
    const tx = {
      orgRoleDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "role-1",
            name: "Site Lead",
            description: "Runs a site",
            scope: "site",
            tenantId: "site-1",
            permissions: [{ permissionKey: "ace.pace.read" }],
          },
        ]),
      },
    };
    const transaction: RolesTransactionBoundary = {
      run: async (_actor, operation) =>
        operation(tx as unknown as Prisma.TransactionClient),
    };
    const effective = {
      listForUserWithSources: jest.fn().mockResolvedValue([]),
    } as unknown as EffectivePermissionsService;
    const service = new BadgeMatrixService(transaction, effective);
    const result = await service.catalogue({
      orgId: "org-1",
      tenantId: "site-1",
      userId: "head-1",
      legacyOrgRoles: [],
      requestId: "r1",
    });
    expect(result.badges.length).toBeGreaterThan(10);
    expect(
      result.badges.find((badge) => badge.key === "pace-full-access")
        ?.roleCoverage,
    ).toEqual([{ roleId: "role-1", coverage: "partial" }]);
    expect(
      result.badges.find((badge) => badge.key === "shopkeeper")?.available,
    ).toBe(false);
    expect(
      result.badges.find((badge) => badge.key === "pace-full-access")
        ?.allowedScopes,
    ).toContain("site");
  });

  it("projects role-inherited and excluded badge state for a selected person", async () => {
    const tx = {
      orgRoleDefinition: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "role-1",
            name: "Staff",
            description: "Staff access",
            scope: "site",
            tenantId: "site-1",
            permissions: [{ permissionKey: "attendance.manage" }],
          },
        ]),
      },
      orgMembership: {
        findUnique: jest.fn().mockResolvedValue({
          user: {
            id: "staff-1",
            name: "Staff",
            displayName: null,
            email: "staff@example.test",
            isActive: true,
            superUser: false,
          },
        }),
      },
      userRoleAssignment: {
        findFirst: jest.fn().mockResolvedValue({ id: "head-assignment" }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: "assignment-1",
            roleDefinitionId: "role-1",
            tenantId: "site-1",
            startsAt: new Date(),
            expiresAt: null,
          },
        ]),
      },
      accessTagGrant: { findMany: jest.fn().mockResolvedValue([]) },
      accessTagExclusion: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "exclusion-1",
            tagKey: AccessTagKey.ATTENDANCE_RECORDER,
            tenantId: "site-1",
          },
        ]),
      },
      siteMembership: {
        findUnique: jest.fn().mockResolvedValue({ id: "site-member" }),
      },
    };
    const transaction: RolesTransactionBoundary = {
      run: async (_actor, operation) =>
        operation(tx as unknown as Prisma.TransactionClient),
    };
    const effective = {
      listForUserWithSources: jest.fn().mockResolvedValue([]),
    } as unknown as EffectivePermissionsService;
    const result = await new BadgeMatrixService(transaction, effective).forUser(
      {
        orgId: "org-1",
        tenantId: "site-1",
        userId: "head-1",
        legacyOrgRoles: [],
        requestId: "r1",
      },
      "staff-1",
    );
    const badge = result.badges.find(
      ({ key }) => key === "attendance-recorder",
    );
    expect(badge).toMatchObject({
      selected: false,
      effectiveCoverage: "none",
      revision: "e:exclusion-1",
      revisions: { organisation: "", site: "e:exclusion-1" },
      sourceRoleIds: ["role-1"],
      exclusions: [{ id: "exclusion-1", tenantId: "site-1" }],
    });
    expect(result.superUserExempt).toBe(false);
    expect(result.canAdministerBadges).toBe(true);
    expect(badge?.editableScopes).toContain("site");
  });
});
