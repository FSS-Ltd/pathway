import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { ConversationQuery } from "./dto/messaging-query.dto";
import {
  decodeConversationCursor,
  encodeConversationCursor,
} from "./messaging-cursor";
import {
  assertMessagingActor,
  requireCurrentStaff,
  type MessagingActor,
} from "./messaging-access";
import { unreadCountsForConversations } from "./messaging-unread-count";
import { parentResponderWhere } from "./parent-message-responder";

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
      await requireCurrentStaff(tx, actor);
      const now = new Date();
      const [site, responder] = await Promise.all([
        tx.tenant.findFirst({
          where: {
            id: actor.tenantId,
            orgId: actor.orgId,
            org: { parentPortalEnabled: true },
          },
          select: { id: true },
        }),
        tx.siteMembership.findFirst({
          where: parentResponderWhere(
            actor.orgId,
            actor.tenantId,
            now,
            actor.userId,
          ),
          select: { id: true },
        }),
      ]);
      if (!site || !responder) {
        throw new NotFoundException("Conversations not found");
      }

      const rows = await tx.messageConversation.findMany({
        where: {
          tenantId: actor.tenantId,
          kind: "PARENT_STAFF",
          guardianIdentity: {
            is: {
              tenantId: actor.tenantId,
              user: {
                isActive: true,
                studentIdentities: { none: { tenantId: actor.tenantId } },
              },
              relationships: {
                some: {
                  tenantId: actor.tenantId,
                  legalAccess: "FULL",
                  startsAt: { lte: now },
                  endedAt: null,
                  revokedAt: null,
                  child: { tenantId: actor.tenantId, isGuest: false },
                },
              },
            },
          },
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
          AND: [
            {
              participants: {
                some: {
                  tenantId: actor.tenantId,
                  kind: "GUARDIAN",
                  removedAt: null,
                },
              },
            },
          ],
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
