import { randomUUID } from "node:crypto";
import { Test, type TestingModule } from "@nestjs/testing";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { prisma } from "@pathway/db";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import { AccessCacheService } from "../access-cache.service";
import { AccessControlModule } from "../access-control.module";
import { readCustomAssignmentInventoryInTransaction } from "../custom-assignment-parity-reader";
import { CustomAssignmentRetirementService } from "../custom-assignment-retirement.service";
import { EffectivePermissionsService } from "../effective-permissions.service";
import { RoleSafetyService } from "../role-safety.service";
import { withSystemRoleFixtureWrites } from "./system-role-fixture";

const PAST = new Date("2026-01-01T00:00:00.000Z");
const LATER = new Date("2026-06-01T00:00:00.000Z");
const FIRST_EXPIRY = new Date("2090-01-01T00:00:00.000Z");
const SECOND_EXPIRY = new Date("2091-01-01T00:00:00.000Z");

describe("audited custom-assignment retirement", () => {
  const orgId = randomUUID();
  const siteA = randomUUID();
  const siteB = randomUUID();
  const headId = randomUUID();
  const staffId = randomUUID();
  const secondStaffId = randomUUID();
  const headRoleId = randomUUID();
  const customRoleIds: string[] = [];
  const sourceAssignmentIds: string[] = [];
  let moduleRef: TestingModule | undefined;
  let permissions: EffectivePermissionsService;
  let retirement: CustomAssignmentRetirementService;

  async function createCustomAssignment(
    userId: string,
    startsAt: Date,
    expiresAt: Date | null,
  ): Promise<string> {
    const roleDefinitionId = randomUUID();
    const assignmentId = randomUUID();
    await prisma.orgRoleDefinition.create({
      data: {
        id: roleDefinitionId,
        orgId,
        tenantId: siteA,
        name: `Legacy attendance ${roleDefinitionId}`,
        scope: "site",
        createdById: headId,
        updatedById: headId,
        permissions: {
          create: { permissionKey: "attendance.manage", grantedById: headId },
        },
      },
    });
    await prisma.userRoleAssignment.create({
      data: {
        id: assignmentId,
        orgId,
        tenantId: siteA,
        userId,
        roleDefinitionId,
        assignedById: headId,
        startsAt,
        expiresAt,
      },
    });
    customRoleIds.push(roleDefinitionId);
    sourceAssignmentIds.push(assignmentId);
    return assignmentId;
  }

  function plan(assignmentIds: readonly string[]) {
    return {
      orgId,
      mappings: assignmentIds.map((assignmentId) => ({
        assignmentId,
        fixedRoleIds: [],
        tagKeys: ["attendance-recorder"],
      })),
    };
  }

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.user.createMany({
      data: [headId, staffId, secondStaffId].map((id) => ({
        id,
        email: `${id}@example.test`,
      })),
    });
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Custom assignment retirement test",
        slug: `assignment-retirement-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteA, siteB].map((id) => ({
        id,
        orgId,
        name: `Retirement site ${id}`,
        slug: `retirement-site-${id}`,
      })),
    });
    await prisma.orgMembership.createMany({
      data: [headId, staffId, secondStaffId].map((userId) => ({
        orgId,
        userId,
      })),
    });
    await prisma.siteMembership.createMany({
      data: [staffId, secondStaffId].map((userId) => ({
        tenantId: siteA,
        userId,
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await withSystemRoleFixtureWrites(async (tx) => {
      await tx.orgRoleDefinition.create({
        data: {
          id: headRoleId,
          orgId,
          name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
          scope: "organisation",
          isSystem: true,
          createdById: headId,
          updatedById: headId,
          permissions: {
            create: [
              "platform.access.roles.manage",
              "platform.access.assignments.manage",
              "attendance.manage",
            ].map((permissionKey) => ({ permissionKey, grantedById: headId })),
          },
        },
      });
    });
    await prisma.userRoleAssignment.create({
      data: {
        orgId,
        userId: headId,
        roleDefinitionId: headRoleId,
        assignedById: headId,
        startsAt: PAST,
      },
    });
    moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    }).compile();
    permissions = moduleRef.get(EffectivePermissionsService);
    retirement = new CustomAssignmentRetirementService(
      permissions,
      moduleRef.get(RoleSafetyService),
      moduleRef.get(OutboxService),
      moduleRef.get(AccessCacheService),
    );
  });

  afterAll(async () => {
    await moduleRef?.close();
    if (!isDatabaseAvailable()) return;
    await prisma.auditEvent.deleteMany({ where: { orgId } });
    await prisma.outboxEvent.deleteMany({ where: { orgId } });
    await prisma.accessTagGrant.deleteMany({ where: { orgId } });
    await prisma.userRoleAssignment.deleteMany({ where: { orgId } });
    await withSystemRoleFixtureWrites(async (tx) => {
      await tx.orgRolePermission.deleteMany({
        where: { roleDefinitionId: { in: [headRoleId, ...customRoleIds] } },
      });
      await tx.orgRoleDefinition.deleteMany({ where: { orgId } });
    });
    await prisma.siteMembership.deleteMany({
      where: { tenantId: { in: [siteA, siteB] } },
    });
    await prisma.orgMembership.deleteMany({ where: { orgId } });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.deleteMany({ where: { orgId } });
    await prisma.org.delete({ where: { id: orgId } });
    await prisma.user.deleteMany({
      where: { id: { in: [headId, staffId, secondStaffId] } },
    });
  });

  it("replaces a site custom assignment with an audited tag and preserves access", async () => {
    if (!isDatabaseAvailable()) return;
    const sourceId = await createCustomAssignment(staffId, PAST, null);
    const actor = {
      orgId,
      userId: headId,
      legacyOrgRoles: [],
      requestId: `retirement-${randomUUID()}`,
    };
    const before = await permissions.listForUser(staffId, orgId, siteA);
    expect(before).toContain("attendance.manage");

    await expect(retirement.retire(plan([sourceId]), actor)).resolves.toEqual([
      {
        userId: staffId,
        assignmentCount: 1,
        createdRoleAssignments: 0,
        createdTagGrants: 1,
        contextCount: 3,
      },
    ]);

    const source = await prisma.userRoleAssignment.findUniqueOrThrow({
      where: { id: sourceId },
    });
    expect(source.revokedById).toBe(headId);
    expect(source.revokedAt).not.toBeNull();
    expect(await permissions.listForUser(staffId, orgId, siteA)).toEqual(
      before,
    );
    expect(await permissions.listForUser(staffId, orgId, siteB)).not.toContain(
      "attendance.manage",
    );
    expect(
      await prisma.auditEvent.count({ where: { orgId, actorUserId: headId } }),
    ).toBe(2);
    expect(
      await prisma.outboxEvent.count({
        where: { orgId, aggregateId: staffId },
      }),
    ).toBe(2);
  });

  it("rolls back one user's replacements and revocations when windows conflict", async () => {
    if (!isDatabaseAvailable()) return;
    const firstId = await createCustomAssignment(
      secondStaffId,
      PAST,
      FIRST_EXPIRY,
    );
    const secondId = await createCustomAssignment(
      secondStaffId,
      LATER,
      SECOND_EXPIRY,
    );
    await expect(
      retirement.retire(plan([firstId, secondId]), {
        orgId,
        userId: headId,
        legacyOrgRoles: [],
        requestId: `retirement-${randomUUID()}`,
      }),
    ).rejects.toThrow(`Existing tag grant does not cover ${secondId}`);
    const assignments = await prisma.userRoleAssignment.findMany({
      where: { id: { in: [firstId, secondId] } },
    });
    expect(assignments.map(({ revokedAt }) => revokedAt)).toEqual([null, null]);
    expect(
      await prisma.accessTagGrant.count({
        where: { orgId, userId: secondStaffId },
      }),
    ).toBe(0);
    expect(
      await prisma.auditEvent.count({
        where: { orgId, entityId: { in: [firstId, secondId] } },
      }),
    ).toBe(0);
  });

  it("rejects an actor without a fixed Organisation Head assignment", async () => {
    if (!isDatabaseAvailable()) return;
    await expect(
      retirement.retire(plan(sourceAssignmentIds.slice(-2)), {
        orgId,
        userId: secondStaffId,
        legacyOrgRoles: ["org:admin"],
        requestId: `retirement-${randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      response: { code: "ACCESS_TAG_ACTOR_NOT_HEAD" },
    });
  });

  it("rejects an inventory read that cannot see every site", async () => {
    if (!isDatabaseAvailable() || !process.env.E2E_RLS_ROLE) return;
    if (process.env.E2E_RLS_ROLE !== "pathway_e2e_rls") {
      throw new Error("Unexpected E2E RLS role");
    }
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_rls"');
        return readCustomAssignmentInventoryInTransaction(
          orgId,
          new Date(),
          tx,
        );
      }),
    ).rejects.toThrow(
      "Custom-assignment cutover requires a maintenance database identity with RLS bypass",
    );
  });
});
