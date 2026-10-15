import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { MessageQuery } from "./dto/messaging-query.dto";
import { assertMessagingActor, type MessagingActor } from "./messaging-access";
import {
  decodeMessageHistoryCursor,
  encodeMessageHistoryCursor,
} from "./message-history-cursor";
import {
  requireStaffSchoolTeamAccess,
  staffSchoolTeamConversationScope,
} from "./staff-school-team-access";

const DEFAULT_LIMIT = 20;

@Injectable()
export class StaffSchoolTeamHistoryService {
  async list(
    actor: MessagingActor,
    conversationId: string,
    query: MessageQuery,
  ) {
    assertMessagingActor(actor);
    const limit = query.limit ?? DEFAULT_LIMIT;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const now = new Date();
      await requireStaffSchoolTeamAccess(tx, actor, now);
      const conversation = await tx.messageConversation.findFirst({
        where: {
          ...staffSchoolTeamConversationScope(actor, now),
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
            actor.tenantId,
            actor.userId,
            conversationId,
          );
        } catch {
          throw new BadRequestException("Invalid message cursor");
        }
      }

      const rows = await tx.message.findMany({
        where: {
          tenantId: actor.tenantId,
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
          // This group thread does not expose guardian read receipts to staff.
          deliveryState: null,
        })),
        nextCursor:
          rows.length > limit && page.length > 0
            ? encodeMessageHistoryCursor(
                page[page.length - 1].sequence,
                actor.tenantId,
                actor.userId,
                conversationId,
              )
            : null,
      };
    });
  }
}
