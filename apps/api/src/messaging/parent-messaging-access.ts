import { Prisma } from "@pathway/db";
import { withParentSiteAccess } from "../common/access/parent-site-access";

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
  return withParentSiteAccess(
    siteId,
    userId,
    permissionKey,
    "Messages not found",
    operation,
  );
}
