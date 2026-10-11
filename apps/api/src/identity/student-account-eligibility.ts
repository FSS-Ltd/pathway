import type { Prisma } from "@pathway/db";

export async function hasOtherSiteAccess(
  tx: Prisma.TransactionClient,
  tenantId: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const now = new Date();
  const [siteMembership, orgMembership, legacyRole, legacyOrgRole, typedRole] =
    await Promise.all([
      tx.siteMembership.findFirst({
        where: { tenantId, userId },
        select: { id: true },
      }),
      tx.orgMembership.findFirst({
        where: { orgId, userId },
        select: { id: true },
      }),
      tx.userTenantRole.findFirst({
        where: { tenantId, userId },
        select: { id: true },
      }),
      tx.userOrgRole.findFirst({
        where: { orgId, userId },
        select: { id: true },
      }),
      tx.userRoleAssignment.findFirst({
        where: {
          orgId,
          userId,
          OR: [{ tenantId: null }, { tenantId }],
          startsAt: { lte: now },
          revokedAt: null,
          AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }],
        },
        select: { id: true },
      }),
    ]);
  return Boolean(
    siteMembership || orgMembership || legacyRole || legacyOrgRole || typedRole,
  );
}
