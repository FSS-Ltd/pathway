import { Injectable, NotFoundException } from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";
import type { MessageQuery } from "./dto/messaging-query.dto";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "./parent-messaging-access";

const READ_PERMISSION = "messaging.messages.read" satisfies PermissionKey;
const DEFAULT_LIMIT = 20;

interface ParentMessagePage {
  items: Array<{
    id: string;
    sequence: number;
    body: string;
    createdAt: string;
    sender: { id: string; displayName: string };
  }>;
  nextBefore: number | null;
}

@Injectable()
export class ParentMessagingHistoryService {
  async list(
    siteId: string,
    userId: string,
    conversationId: string,
    query: MessageQuery,
  ): Promise<ParentMessagePage> {
    return withParentMessagingAccess(
      siteId,
      userId,
      READ_PERMISSION,
      async (tx, guardianId) => {
        const conversation = await tx.messageConversation.findFirst({
          where: {
            ...parentConversationScope(siteId, userId, guardianId),
            id: conversationId,
          },
          select: { id: true },
        });
        if (!conversation) {
          throw new NotFoundException("Messages not found");
        }

        const limit = query.limit ?? DEFAULT_LIMIT;
        const rows = await tx.message.findMany({
          where: {
            tenantId: siteId,
            conversationId: conversation.id,
            ...(query.before ? { sequence: { lt: query.before } } : {}),
          },
          select: {
            id: true,
            sequence: true,
            bodyEncrypted: true,
            createdAt: true,
            sender: {
              select: {
                kind: true,
                userId: true,
                user: { select: { displayName: true, name: true } },
              },
            },
          },
          orderBy: { sequence: "desc" },
          take: limit + 1,
        });
        const page = rows.slice(0, limit);
        return {
          items: page.map((row) => ({
            id: row.id,
            sequence: row.sequence,
            body: row.bodyEncrypted,
            createdAt: row.createdAt.toISOString(),
            sender: {
              id: row.sender.userId,
              displayName:
                row.sender.user.displayName?.trim() ||
                row.sender.user.name?.trim() ||
                (row.sender.kind === "GUARDIAN" ? "Parent" : "School team"),
            },
          })),
          nextBefore:
            rows.length > limit ? (page.at(-1)?.sequence ?? null) : null,
        };
      },
    );
  }
}
