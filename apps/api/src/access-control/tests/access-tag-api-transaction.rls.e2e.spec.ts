import { randomUUID } from "node:crypto";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { prisma, runTransaction } from "@pathway/db";
import { Test } from "@nestjs/testing";
import { OutboxService } from "../../common/outbox/outbox.service";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import { AccessTagsService } from "../access-tags.service";
import { AccessControlModule } from "../access-control.module";
import { EffectivePermissionsService } from "../effective-permissions.service";
import {
  createRolesTransactionBoundary,
  type RoleActorContext,
} from "../roles.service";

const RLS_ROLE = "pathway_e2e_rls";

function testTransactionBoundary() {
  return createRolesTransactionBoundary(async (operation) =>
    runTransaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${RLS_ROLE}"`);
      const roles = await tx.$queryRaw<
        Array<{ bypass: boolean; superuser: boolean }>
      >`
        SELECT rolbypassrls AS bypass, rolsuper AS superuser
        FROM pg_roles WHERE rolname = current_user
      `;
      expect(roles).toEqual([{ bypass: false, superuser: false }]);
      return operation(tx);
    }),
  );
}

describe("access-tag API transaction and forced RLS", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const headId = randomUUID();
  const staffId = randomUUID();
  const headRoleId = randomUUID();
  const attendanceRoleId = randomUUID();
  const actor: RoleActorContext = {
    orgId,
    tenantId: siteId,
    userId: headId,
    legacyOrgRoles: [],
    requestId: "tag-api-rls",
  };
  const boundary = testTransactionBoundary();
  const service = new AccessTagsService(boundary, new OutboxService());
  const runtimeBoundary = createRolesTransactionBoundary();
  const runtimeService = new AccessTagsService(
    runtimeBoundary,
    new OutboxService(),
  );

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.user.createMany({
      data: [
        { id: headId, email: `${headId}@example.test` },
        { id: staffId, email: `${staffId}@example.test` },
      ],
    });
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Tag API test",
        slug: `tag-api-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [
        { id: siteId, orgId, name: "Tag site A", slug: `tag-api-${siteId}` },
        {
          id: otherSiteId,
          orgId,
          name: "Tag site B",
          slug: `tag-api-${otherSiteId}`,
        },
      ],
    });
    await prisma.orgMembership.createMany({
      data: [
        { orgId, userId: headId, role: "ORG_ADMIN" },
        { orgId, userId: staffId, role: "ORG_MEMBER" },
      ],
    });
    await prisma.siteMembership.create({
      data: { tenantId: siteId, userId: staffId },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "OrgRoleDefinition" DISABLE TRIGGER "OrgRoleDefinition_protect_system_template"',
    );
    try {
      await prisma.orgRoleDefinition.create({
        data: {
          id: headRoleId,
          orgId,
          name: SYSTEM_ROLE_TEMPLATES.organisationHead.name,
          scope: "organisation",
          isSystem: true,
          createdById: headId,
          updatedById: headId,
        },
      });
    } finally {
      await prisma.$executeRawUnsafe(
        'ALTER TABLE "OrgRoleDefinition" ENABLE TRIGGER "OrgRoleDefinition_protect_system_template"',
      );
    }
    await prisma.orgRoleDefinition.create({
      data: {
        id: attendanceRoleId,
        orgId,
        name: "Tag API attendance delegator",
        scope: "organisation",
        createdById: headId,
        updatedById: headId,
        permissions: {
          create: { permissionKey: "attendance.manage", grantedById: headId },
        },
      },
    });
    await prisma.userRoleAssignment.createMany({
      data: [headRoleId, attendanceRoleId].map((roleDefinitionId) => ({
        orgId,
        userId: headId,
        roleDefinitionId,
        assignedById: headId,
      })),
    });
  });

  it("grants, audits, revokes, and preserves history under a non-bypass role", async () => {
    if (!isDatabaseAvailable()) return;
    const created = await service.grant(
      { userId: staffId, tagKey: "attendance-recorder", scope: "organisation" },
      actor,
    );
    expect(created).toMatchObject({
      orgId,
      tenantId: null,
      userId: staffId,
      tagKey: "attendance-recorder",
      grantedById: headId,
    });

    await boundary.run(actor, async (tx) => {
      expect(
        await tx.auditEvent.count({ where: { entityId: created.id } }),
      ).toBe(1);
      expect(
        await tx.outboxEvent.count({ where: { aggregateId: staffId } }),
      ).toBe(1);
    });

    const revoked = await service.revoke(created.id, actor);
    expect(revoked).toMatchObject({ revokedById: headId });

    await boundary.run(actor, async (tx) => {
      const persisted = await tx.accessTagGrant.findUnique({
        where: { id: created.id },
      });
      expect(persisted?.revokedById).toBe(headId);
      expect(persisted?.revokedAt).not.toBeNull();
      expect(
        await tx.auditEvent.count({ where: { entityId: created.id } }),
      ).toBe(2);
      expect(
        await tx.outboxEvent.count({ where: { aggregateId: staffId } }),
      ).toBe(2);
    });
  });

  it("does not expose a site grant after switching to a different site", async () => {
    if (!isDatabaseAvailable()) return;
    const created = await runtimeService.grant(
      { userId: staffId, tagKey: "attendance-recorder", scope: "site" },
      actor,
    );
    const moduleRef = await Test.createTestingModule({
      imports: [AccessControlModule],
    }).compile();
    const permissions = moduleRef.get(EffectivePermissionsService);
    try {
      const request = {
        userId: staffId,
        orgId,
        permission: "attendance.manage" as const,
        now: new Date(),
      };
      await expect(
        permissions.resolve({ ...request, tenantId: siteId }),
      ).resolves.toMatchObject({
        allowed: true,
        sourceTagGrantIds: [created.id],
      });
      await expect(
        permissions.resolve({ ...request, tenantId: otherSiteId }),
      ).resolves.toMatchObject({
        allowed: false,
      });
    } finally {
      await moduleRef.close();
    }
    const otherSiteGrants = await runtimeService.list({
      ...actor,
      tenantId: otherSiteId,
    });
    expect(otherSiteGrants.items).not.toContainEqual(
      expect.objectContaining({ id: created.id }),
    );
    await expect(
      runtimeService.revoke(created.id, { ...actor, tenantId: otherSiteId }),
    ).rejects.toMatchObject({
      response: { code: "ACCESS_TAG_GRANT_NOT_FOUND" },
    });
    await expect(
      service.revoke(created.id, { ...actor, tenantId: otherSiteId }),
    ).rejects.toMatchObject({
      response: { code: "ACCESS_TAG_GRANT_NOT_FOUND" },
    });
    await expect(
      runtimeService.revoke(created.id, actor),
    ).resolves.toMatchObject({
      revokedById: headId,
    });
  });

  it("rejects a site grant when the recipient has no membership there", async () => {
    if (!isDatabaseAvailable()) return;
    await expect(
      runtimeService.grant(
        { userId: staffId, tagKey: "attendance-recorder", scope: "site" },
        { ...actor, tenantId: otherSiteId },
      ),
    ).rejects.toMatchObject({
      response: { code: "ACCESS_TAG_ASSIGNEE_NOT_IN_SITE" },
    });
  });
});
