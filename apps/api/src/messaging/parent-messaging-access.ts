import { NotFoundException } from "@nestjs/common";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { Prisma, prisma, withTenantRlsContext } from "@pathway/db";

type ParentMessagingPermission =
  | "messaging.conversations.read"
  | "messaging.messages.read"
  | "messaging.messages.send"
  | "messaging.conversations.create";

export function parentConversationScope(
  siteId: string,
  userId: string,
  guardianId: string,
): Prisma.MessageConversationWhereInput {
  return {
    tenantId: siteId,
    kind: "PARENT_STAFF",
    guardianIdentityId: guardianId,
    participants: {
      some: {
        tenantId: siteId,
        userId,
        kind: "GUARDIAN",
        guardianIdentityId: guardianId,
        removedAt: null,
      },
    },
  };
}

export async function withParentMessagingAccess<T>(
  siteId: string,
  userId: string,
  permissionKey: ParentMessagingPermission,
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
    throw new NotFoundException("Messages not found");
  }

  const site = await prisma.tenant.findUnique({
    where: { id: siteId },
    select: {
      orgId: true,
      org: { select: { parentPortalEnabled: true } },
    },
  });
  if (!site?.org.parentPortalEnabled) {
    throw new NotFoundException("Messages not found");
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
      throw new NotFoundException("Messages not found");
    }
    return operation(tx, guardian.id, site.orgId);
  });
}
