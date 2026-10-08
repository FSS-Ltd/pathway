import { BadRequestException, Injectable } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { ConversationQuery } from "./dto/messaging-query.dto";
import {
  decodeConversationCursor,
  encodeConversationCursor,
} from "./messaging-cursor";
import { assertMessagingActor, type MessagingActor } from "./messaging-access";
import { unreadCountsForConversations } from "./messaging-unread-count";
import {
  requireStaffSchoolTeamAccess,
  staffSchoolTeamConversationScope,
} from "./staff-school-team-access";

const DEFAULT_LIMIT = 20;
const VIEW = "school-team-conversations";

@Injectable()
export class StaffSchoolTeamService {
  async list(actor: MessagingActor, query: ConversationQuery) {
    assertMessagingActor(actor);
    let cursor: ReturnType<typeof decodeConversationCursor> | undefined;
    if (query.cursor) {
      try {
        cursor = decodeConversationCursor(
          query.cursor,
          actor.tenantId,
          actor.userId,
          VIEW,
        );
      } catch {
        throw new BadRequestException("Invalid conversation cursor");
      }
    }
    const limit = query.limit ?? DEFAULT_LIMIT;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const now = new Date();
      await requireStaffSchoolTeamAccess(tx, actor, now);

      const rows = await tx.messageConversation.findMany({
        where: {
          ...staffSchoolTeamConversationScope(actor, now),
          ...(cursor
            ? {
                OR: [
                  { updatedAt: { lt: cursor.updatedAt } },
                  { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
                ],
              }
            : {}),
        },
        select: {
          id: true,
          kind: true,
          updatedAt: true,
          guardianIdentity: {
            select: {
              user: { select: { displayName: true, name: true } },
            },
          },
          messages: {
            orderBy: { sequence: "desc" },
            take: 1,
            select: { bodyEncrypted: true, createdAt: true },
          },
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const unread = await unreadCountsForConversations(
        tx,
        actor.tenantId,
        actor.userId,
        page.map((row) => row.id),
      );
      const last = page.at(-1);
      return {
        items: page.map((row) => {
          const guardian = row.guardianIdentity?.user;
          const latest = row.messages[0];
          return {
            id: row.id,
            kind: row.kind,
            title:
              guardian?.displayName?.trim() ||
              guardian?.name?.trim() ||
              "Parent",
            latestMessage: latest
              ? {
                  preview: latest.bodyEncrypted
                    .replace(/\s+/g, " ")
                    .trim()
                    .slice(0, 160),
                  createdAt: latest.createdAt.toISOString(),
                }
              : null,
            updatedAt: row.updatedAt.toISOString(),
            unreadCount: unread.get(row.id) ?? 0,
          };
        }),
        nextCursor:
          rows.length > limit && last
            ? encodeConversationCursor(last, actor.tenantId, actor.userId, VIEW)
            : null,
      };
    });
  }
}
