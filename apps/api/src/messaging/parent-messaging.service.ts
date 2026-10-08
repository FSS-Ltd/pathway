import { Injectable, NotFoundException } from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "./parent-messaging-access";

const READ_PERMISSION = "messaging.conversations.read" satisfies PermissionKey;

interface ParentConversationPage {
  items: Array<{
    id: string;
    kind: "PARENT_STAFF";
    title: "School team";
    latestMessage: { preview: string; createdAt: string } | null;
    updatedAt: string;
    unreadCount: number;
  }>;
  nextCursor: null;
}

@Injectable()
export class ParentMessagingService {
  async list(siteId: string, userId: string): Promise<ParentConversationPage> {
    return withParentMessagingAccess(
      siteId,
      userId,
      READ_PERMISSION,
      async (tx, guardianId) => {
        const conversation = await tx.messageConversation.findFirst({
          where: parentConversationScope(siteId, userId, guardianId),
          select: {
            id: true,
            kind: true,
            updatedAt: true,
            participants: {
              where: {
                tenantId: siteId,
                userId,
                kind: "GUARDIAN",
                guardianIdentityId: guardianId,
                removedAt: null,
              },
              select: { id: true },
              take: 1,
            },
            messages: {
              orderBy: { sequence: "desc" },
              take: 1,
              select: { bodyEncrypted: true, createdAt: true },
            },
          },
        });
        if (!conversation) return { items: [], nextCursor: null };

        const participantId = conversation.participants[0]?.id;
        if (!participantId) {
          throw new NotFoundException("Messages not found");
        }
        const readCursor = await tx.messageParticipantReadCursor.findUnique({
          where: {
            tenantId_conversationId_participantId: {
              tenantId: siteId,
              conversationId: conversation.id,
              participantId,
            },
          },
          select: { lastReadSequence: true },
        });
        const unreadCount = await tx.message.count({
          where: {
            tenantId: siteId,
            conversationId: conversation.id,
            senderParticipantId: { not: participantId },
            sequence: { gt: readCursor?.lastReadSequence ?? 0 },
          },
        });
        const latest = conversation.messages[0];
        return {
          items: [
            {
              id: conversation.id,
              kind: "PARENT_STAFF",
              title: "School team",
              latestMessage: latest
                ? {
                    preview: latest.bodyEncrypted
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 160),
                    createdAt: latest.createdAt.toISOString(),
                  }
                : null,
              updatedAt: conversation.updatedAt.toISOString(),
              unreadCount,
            },
          ],
          nextCursor: null,
        };
      },
    );
  }
}
