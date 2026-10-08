import { Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { MessageQuery } from "./dto/messaging-query.dto";
import { assertMessagingActor, type MessagingActor } from "./messaging-access";
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

      const rows = await tx.message.findMany({
        where: {
          tenantId: actor.tenantId,
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
    });
  }
}
