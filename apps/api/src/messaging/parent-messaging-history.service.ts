import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PermissionKey } from "@pathway/platform";
import type { MessageQuery } from "./dto/messaging-query.dto";
import {
  parentConversationScope,
  withParentMessagingAccess,
} from "./parent-messaging-access";
import {
  decodeMessageHistoryCursor,
  encodeMessageHistoryCursor,
} from "./message-history-cursor";
import {
  deliveryStatesForMessages,
  type PersistedDeliveryState,
} from "./message-delivery-state";

const READ_PERMISSION = "messaging.messages.read" satisfies PermissionKey;
const DEFAULT_LIMIT = 20;

function groupDeliveryState(
  state: PersistedDeliveryState | undefined,
): "sent" | "delivered" {
  return state === "read" ? "delivered" : (state ?? "sent");
}

interface ParentMessagePage {
  items: Array<{
    id: string;
    sequence: number;
    body: string;
    createdAt: string;
    sender: { id: string; displayName: string };
    deliveryState: Exclude<PersistedDeliveryState, "read"> | null;
  }>;
  nextCursor: string | null;
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

        let before: number | undefined;
        if (query.cursor) {
          try {
            before = decodeMessageHistoryCursor(
              query.cursor,
              siteId,
              userId,
              conversationId,
            );
          } catch {
            throw new BadRequestException("Invalid message cursor");
          }
        }

        const limit = query.limit ?? DEFAULT_LIMIT;
        const rows = await tx.message.findMany({
          where: {
            tenantId: siteId,
            conversationId: conversation.id,
            ...(before ? { sequence: { lt: before } } : {}),
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
        const deliveryStates = await deliveryStatesForMessages(
          tx,
          siteId,
          conversationId,
          page.filter((row) => row.sender.userId === userId),
        );
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
            deliveryState:
              row.sender.userId === userId
                ? groupDeliveryState(deliveryStates.get(row.id))
                : null,
          })),
          nextCursor:
            rows.length > limit && page.length > 0
              ? encodeMessageHistoryCursor(
                  page[page.length - 1].sequence,
                  siteId,
                  userId,
                  conversationId,
                )
              : null,
        };
      },
    );
  }
}
