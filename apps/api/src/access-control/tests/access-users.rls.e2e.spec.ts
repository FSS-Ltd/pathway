import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { prisma } from "@pathway/db";
import { AccessControlModule } from "../access-control.module";
import { AccessUsersService } from "../access-users.service";
import {
  FEATURE_AVAILABILITY_READER,
  type FeatureAvailabilityReader,
} from "../effective-permissions.service";
import type { RoleActorContext } from "../roles.service";
import { isDatabaseAvailable, requireDatabase } from "../../../test-helpers.e2e";

describe("access-users effective-permissions endpoint", () => {
  const orgA = randomUUID();
  const orgB = randomUUID();
  const orgAdminA = randomUUID();
  const nonAdminA = randomUUID();
  const targetUserA = randomUUID();
  const crossOrgUser = randomUUID();
  const roleId = randomUUID();
  const orgIds = [orgA, orgB];
  const userIds = [orgAdminA, nonAdminA, targetUserA, crossOrgUser];

  const actorAdminA: RoleActorContext = {
    orgId: orgA,
    userId: orgAdminA,
    legacyOrgRoles: ["org:admin"],
    requestId: "access-users-request-1",
  };

  let alwaysAvailableModuleRef: TestingModule | undefined;
  let failClosedModuleRef: TestingModule | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;

    await prisma.user.createMany({
      data: userIds.map((id) => ({ id, email: `${id}@example.test` })),
    });
    await prisma.org.createMany({
      data: orgIds.map((id) => ({
        id,
        name: `Access users org ${id}`,
        slug: `access-users-${id}`,
        planCode: "trial",
      })),
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId: orgA, userId: orgAdminA, role: "ORG_ADMIN" },
        { orgId: orgA, userId: nonAdminA, role: "ORG_MEMBER" },
        { orgId: orgA, userId: targetUserA, role: "ORG_MEMBER" },
        { orgId: orgB, userId: crossOrgUser, role: "ORG_MEMBER" },
      ],
    });
    await prisma.orgVertical.createMany({
      data: orgIds.map((id) => ({ orgId: id, vertical: "ACE_SCHOOL" })),
    });
    await prisma.orgRoleDefinition.create({
      data: {
        id: roleId,
        orgId: orgA,
        name: `Access users test role ${roleId}`,
        scope: "organisation",
        createdById: orgAdminA,
        updatedById: orgAdminA,
        permissions: {
          create: [{ permissionKey: "ace.pace.read", grantedById: orgAdminA }],
        },
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        orgId: orgA,
        userId: targetUserA,
        roleDefinitionId: roleId,
        assignedById: orgAdminA,
      },
    });

    const alwaysAvailable: FeatureAvailabilityReader = {
      isAvailable: async () => true,
    };
    alwaysAvailableModuleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    })
      .overrideProvider(FEATURE_AVAILABILITY_READER)
      .useValue(alwaysAvailable)
      .compile();

    failClosedModuleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    }).compile();
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await prisma.userRoleAssignment.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.orgRolePermission.deleteMany({ where: { roleDefinitionId: roleId } });
    await prisma.orgRoleDefinition.deleteMany({ where: { id: roleId } });
    await prisma.orgMembership.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.orgVertical.deleteMany({ where: { orgId: { in: orgIds } } });
    await prisma.org.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await alwaysAvailableModuleRef?.close();
    await failClosedModuleRef?.close();
  });

  it("resolves the real granted permission using the default feature-availability reader, since ace.pace.read declares no toggle", async () => {
    if (!isDatabaseAvailable()) return;

    const service = failClosedModuleRef!.get(AccessUsersService);
    await expect(
      service.getEffectivePermissions(targetUserA, actorAdminA),
    ).resolves.toEqual({
      userId: targetUserA,
      orgId: orgA,
      tenantId: null,
      permissions: [{ permissionKey: "ace.pace.read", sourceRoleIds: [roleId] }],
    });
  });

  it("resolves the real granted permission and its source role once feature availability is configured", async () => {
    if (!isDatabaseAvailable()) return;

    const service = alwaysAvailableModuleRef!.get(AccessUsersService);
    await expect(
      service.getEffectivePermissions(targetUserA, actorAdminA),
    ).resolves.toEqual({
      userId: targetUserA,
      orgId: orgA,
      tenantId: null,
      permissions: [{ permissionKey: "ace.pace.read", sourceRoleIds: [roleId] }],
    });
  });

  it("does not leak a target user's grants from a different organisation", async () => {
    if (!isDatabaseAvailable()) return;

    const service = alwaysAvailableModuleRef!.get(AccessUsersService);
    await expect(
      service.getEffectivePermissions(crossOrgUser, actorAdminA),
    ).resolves.toEqual({
      userId: crossOrgUser,
      orgId: orgA,
      tenantId: null,
      permissions: [],
    });
  });
});
