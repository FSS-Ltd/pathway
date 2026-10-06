import {
  applyTenantContext,
  withOrgRlsContext,
  type Prisma,
} from "@pathway/db";
import type { InventoryRole } from "./custom-assignment-inventory";
import { CutoverPreviewError } from "./custom-assignment-parity-error";

const PAGE_SIZE = 200;

export async function readCustomAssignmentInventory(orgId: string, now: Date) {
  return withOrgRlsContext(orgId, (tx) =>
    readCustomAssignmentInventoryInTransaction(orgId, now, tx),
  );
}

/** Re-read one user's assignments inside the cutover write transaction. */
export async function readCustomAssignmentInventoryInTransaction(
  orgId: string,
  now: Date,
  tx: Prisma.TransactionClient,
  userId?: string,
) {
  // Tenant and role-definition policies hide other sites from ordinary RLS
  // identities. A partial inventory could falsely report successful cutover.
  const [databaseRole] = await tx.$queryRaw<{ canReadAll: boolean }[]>`
    SELECT (rolsuper OR rolbypassrls) AS "canReadAll"
    FROM pg_roles WHERE rolname = current_user
  `;
  if (!databaseRole?.canReadAll) {
    throw new CutoverPreviewError(
      "Custom-assignment cutover requires a maintenance database identity with RLS bypass",
    );
  }
  await applyTenantContext(tx, "", orgId);
  await tx.$executeRawUnsafe(
    "SELECT set_config('app.assignment_org_read', 'on', true)",
  );
  return readInventory(tx, orgId, now, userId);
}

async function readInventory(
  tx: Prisma.TransactionClient,
  orgId: string,
  now: Date,
  userId?: string,
) {
  const org = await tx.org.findUnique({
    where: { id: orgId },
    select: { id: true },
  });
  if (!org) throw new CutoverPreviewError("Organisation not found");
  const where: Prisma.UserRoleAssignmentWhereInput = {
    orgId,
    ...(userId ? { userId } : {}),
    startsAt: { lte: now },
    revokedAt: null,
    OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    roleDefinition: { orgId, isSystem: false },
  };
  const [count, scheduledCount, fixedRoles, customRoles, sites] =
    await Promise.all([
      tx.userRoleAssignment.count({ where }),
      tx.userRoleAssignment.count({
        where: {
          orgId,
          ...(userId ? { userId } : {}),
          startsAt: { gt: now },
          revokedAt: null,
          roleDefinition: { orgId, isSystem: false },
        },
      }),
      tx.orgRoleDefinition.findMany({
        where: { orgId, isSystem: true, isActive: true },
        select: {
          id: true,
          name: true,
          scope: true,
          tenantId: true,
          isActive: true,
          permissions: { select: { permissionKey: true } },
        },
      }),
      tx.orgRoleDefinition.findMany({
        where: { orgId, isSystem: false },
        select: { id: true },
      }),
      tx.tenant.findMany({ where: { orgId }, select: { id: true } }),
    ]);
  if (scheduledCount > 0) {
    throw new CutoverPreviewError(
      "Scheduled custom assignments exist; resolve them before retirement",
    );
  }
  const assignments = [];
  let cursor: string | undefined;
  while (true) {
    const page = await tx.userRoleAssignment.findMany({
      where,
      orderBy: { id: "asc" },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        userId: true,
        tenantId: true,
        startsAt: true,
        expiresAt: true,
        roleDefinition: {
          select: {
            id: true,
            name: true,
            scope: true,
            tenantId: true,
            isActive: true,
            permissions: { select: { permissionKey: true } },
          },
        },
      },
    });
    assignments.push(...page);
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1].id;
  }
  if (assignments.length !== count) {
    throw new CutoverPreviewError(
      "Assignments changed during the scan; rerun under a write freeze",
    );
  }
  const userIds = [...new Set(assignments.map(({ userId }) => userId))];
  const [memberships, siteMemberships] = await Promise.all([
    tx.orgMembership.findMany({
      where: { orgId, userId: { in: userIds } },
      select: { userId: true },
    }),
    tx.siteMembership.findMany({
      where: {
        userId: { in: userIds },
        tenantId: { in: sites.map(({ id }) => id) },
      },
      select: { userId: true, tenantId: true },
    }),
  ]);
  return {
    assignments,
    fixedRoles: fixedRoles.map(
      (role): InventoryRole => ({
        id: role.id,
        name: role.name,
        scope: role.scope,
        tenantId: role.tenantId,
        isActive: role.isActive,
        permissionKeys: role.permissions.map(
          ({ permissionKey }) => permissionKey,
        ),
      }),
    ),
    customRoleIds: new Set(customRoles.map(({ id }) => id)),
    siteIds: sites.map(({ id }) => id).sort(),
    memberIds: new Set(memberships.map(({ userId }) => userId)),
    siteMemberKeys: new Set(
      siteMemberships.map(({ userId, tenantId }) => `${userId}:${tenantId}`),
    ),
  };
}
