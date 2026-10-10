import { NotFoundException } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";

export async function withParentSiteAccess<T>(
  siteId: string,
  userId: string,
  permissionKey: (typeof SYSTEM_ROLE_TEMPLATES.parent.permissions)[number],
  notFoundMessage: string,
  operation: (
    tx: Prisma.TransactionClient,
    guardianId: string,
    orgId: string,
  ) => Promise<T>,
): Promise<T> {
  if (
    !siteId.trim() ||
    !userId.trim() ||
    !SYSTEM_ROLE_TEMPLATES.parent.permissions.includes(permissionKey)
  ) {
    throw new NotFoundException(notFoundMessage);
  }

  const site = await prisma.tenant.findUnique({
    where: { id: siteId },
    select: {
      orgId: true,
      org: { select: { parentPortalEnabled: true } },
    },
  });
  if (!site?.org.parentPortalEnabled) {
    throw new NotFoundException(notFoundMessage);
  }

  return withTenantRlsContext(siteId, site.orgId, async (tx) => {
    const now = new Date();
    const [user, guardian, student, permission] = await Promise.all([
      tx.user.findFirst({
        where: { id: userId, isActive: true },
        select: { id: true },
      }),
      tx.guardianIdentity.findFirst({
        where: {
          tenantId: siteId,
          userId,
          relationships: {
            some: {
              tenantId: siteId,
              legalAccess: "FULL",
              startsAt: { lte: now },
              endedAt: null,
              revokedAt: null,
              child: { tenantId: siteId, isGuest: false },
            },
          },
        },
        select: { id: true },
      }),
      tx.studentIdentity.findUnique({
        where: { tenantId_userId: { tenantId: siteId, userId } },
        select: { id: true },
      }),
      tx.permissionDefinition.findUnique({
        where: { key: permissionKey },
        select: { isActive: true },
      }),
    ]);
    if (!user || !guardian || student || !permission?.isActive) {
      throw new NotFoundException(notFoundMessage);
    }
    return operation(tx, guardian.id, site.orgId);
  });
}
