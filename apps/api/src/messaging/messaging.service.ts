import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import type {
  ConversationQuery,
  MessageQuery,
  ReadCursorInput,
} from "./dto/messaging-query.dto";
import {
  decodeConversationCursor,
  encodeConversationCursor,
} from "./messaging-cursor";
import {
  assertMessagingActor,
  requireCurrentStaff,
  STAFF_CONVERSATION_KINDS,
  type MessagingActor,
} from "./messaging-access";

const DEFAULT_LIMIT = 20;

@Injectable()
export class MessagingService {
  async listStaffConversations(
    actor: MessagingActor,
    query: ConversationQuery,
  ) {
    assertMessagingActor(actor);
    let cursor: ReturnType<typeof decodeConversationCursor> | undefined;
    if (query.cursor) {
      try {
        cursor = decodeConversationCursor(
          query.cursor,
          actor.tenantId,
          actor.userId,
        );
      } catch {
        throw new BadRequestException("Invalid conversation cursor");
      }
    }
    const limit = query.limit ?? DEFAULT_LIMIT;

    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const rows = await tx.messageConversation.findMany({
        where: {
          tenantId: actor.tenantId,
          kind: { in: [...STAFF_CONVERSATION_KINDS] },
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
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
          participants: {
            where: { removedAt: null },
            take: 3,
            select: {
              userId: true,
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
      const last = page.at(-1);
      const unreadRows = page.length
        ? await tx.$queryRaw<
            Array<{ conversationId: string; unreadCount: bigint }>
          >(Prisma.sql`
            SELECT message."conversationId" AS "conversationId",
                   COUNT(*) AS "unreadCount"
            FROM "Message" AS message
            JOIN "MessageParticipant" AS participant
              ON participant."tenantId" = message."tenantId"
             AND participant."conversationId" = message."conversationId"
             AND participant."userId" = ${actor.userId}
             AND participant."kind" = 'STAFF'::"MessageParticipantKind"
             AND participant."removedAt" IS NULL
            LEFT JOIN "MessageParticipantReadCursor" AS read_cursor
              ON read_cursor."tenantId" = message."tenantId"
             AND read_cursor."conversationId" = message."conversationId"
             AND read_cursor."participantId" = participant."id"
            WHERE message."tenantId" = ${actor.tenantId}
              AND message."conversationId" IN (${Prisma.join(page.map((row) => row.id))})
              AND message."senderParticipantId" <> participant."id"
              AND message."sequence" > COALESCE(read_cursor."lastReadSequence", 0)
            GROUP BY message."conversationId"
          `)
        : [];
      const unreadByConversation = new Map(
        unreadRows.map((row) => [row.conversationId, Number(row.unreadCount)]),
      );
      return {
        items: page.map((row) => {
          const other = row.participants.find(
            (participant) => participant.userId !== actor.userId,
          );
          const latest = row.messages[0];
          return {
            id: row.id,
            kind: row.kind,
            title:
              row.kind === "STAFF_ROOM"
                ? "Staff room"
                : other?.user.displayName?.trim() ||
                  other?.user.name?.trim() ||
                  "Staff member",
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
            unreadCount: unreadByConversation.get(row.id) ?? 0,
          };
        }),
        nextCursor:
          rows.length > limit && last
            ? encodeConversationCursor(last, actor.tenantId, actor.userId)
            : null,
      };
    });
  }

  async listStaffMessages(
    actor: MessagingActor,
    conversationId: string,
    query: MessageQuery,
  ) {
    assertMessagingActor(actor);
    const limit = query.limit ?? DEFAULT_LIMIT;
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const conversation = await tx.messageConversation.findFirst({
        where: {
          id: conversationId,
          tenantId: actor.tenantId,
          kind: { in: [...STAFF_CONVERSATION_KINDS] },
          participants: {
            some: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              kind: "STAFF",
              removedAt: null,
            },
          },
        },
        select: { id: true, kind: true },
      });
      if (!conversation) throw new NotFoundException("Conversation not found");

      const rows = await tx.message.findMany({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          ...(query.before ? { sequence: { lt: query.before } } : {}),
        },
        select: {
          id: true,
          sequence: true,
          bodyEncrypted: true,
          createdAt: true,
          sender: {
            select: {
              userId: true,
              user: { select: { displayName: true, name: true } },
            },
          },
        },
        orderBy: { sequence: "desc" },
        take: limit + 1,
      });
      const page = rows.slice(0, limit);
      const recipient =
        conversation.kind === "STAFF_DIRECT" &&
        page.some((row) => row.sender.userId === actor.userId)
          ? await tx.messageParticipant.findFirst({
              where: {
                tenantId: actor.tenantId,
                conversationId,
                userId: { not: actor.userId },
                kind: "STAFF",
                removedAt: null,
                user: {
                  isActive: true,
                  siteMemberships: {
                    some: {
                      tenantId: actor.tenantId,
                      role: { in: ["SITE_ADMIN", "STAFF"] },
                    },
                  },
                  studentIdentities: {
                    none: { tenantId: actor.tenantId },
                  },
                },
              },
              select: {
                readCursors: {
                  where: { tenantId: actor.tenantId, conversationId },
                  select: { lastReadSequence: true },
                  take: 1,
                },
              },
            })
          : null;
      const recipientReadSequence =
        recipient?.readCursors[0]?.lastReadSequence ?? 0;
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
              "Staff member",
          },
          recipientRead:
            recipient && row.sender.userId === actor.userId
              ? row.sequence <= recipientReadSequence
              : null,
        })),
        nextBefore:
          rows.length > limit ? (page.at(-1)?.sequence ?? null) : null,
      };
    });
  }

  async advanceStaffReadCursor(
    actor: MessagingActor,
    conversationId: string,
    input: ReadCursorInput,
  ) {
    assertMessagingActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireCurrentStaff(tx, actor);
      const participant = await tx.messageParticipant.findFirst({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          userId: actor.userId,
          kind: "STAFF",
          removedAt: null,
          conversation: { kind: { in: [...STAFF_CONVERSATION_KINDS] } },
        },
        select: { id: true },
      });
      if (!participant) throw new NotFoundException("Conversation not found");
      const message = await tx.message.findFirst({
        where: {
          tenantId: actor.tenantId,
          conversationId,
          sequence: input.sequence,
        },
        select: { id: true },
      });
      if (!message) throw new BadRequestException("Message sequence not found");

      const rows = await tx.$queryRaw<Array<{ lastReadSequence: number }>>`
        INSERT INTO "MessageParticipantReadCursor" (
          "id", "tenantId", "conversationId", "participantId", "lastReadSequence"
        ) VALUES (
          ${randomUUID()}, ${actor.tenantId}, ${conversationId},
          ${participant.id}, ${input.sequence}
        )
        ON CONFLICT ("tenantId", "conversationId", "participantId")
        DO UPDATE SET
          "lastReadSequence" = GREATEST(
            "MessageParticipantReadCursor"."lastReadSequence",
            EXCLUDED."lastReadSequence"
          ),
          "updatedAt" = CURRENT_TIMESTAMP
        RETURNING "lastReadSequence"
      `;
      return { lastReadSequence: rows[0].lastReadSequence };
    });
  }
}
