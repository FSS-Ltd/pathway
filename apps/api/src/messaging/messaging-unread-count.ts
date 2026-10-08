import { Prisma } from "@pathway/db";

export async function unreadCountsForConversations(
  tx: Prisma.TransactionClient,
  tenantId: string,
  userId: string,
  conversationIds: string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();

  const rows = await tx.$queryRaw<
    Array<{ conversationId: string; unreadCount: bigint }>
  >(Prisma.sql`
    SELECT message."conversationId" AS "conversationId",
           COUNT(*) AS "unreadCount"
    FROM "Message" AS message
    JOIN "MessageParticipant" AS participant
      ON participant."tenantId" = message."tenantId"
     AND participant."conversationId" = message."conversationId"
     AND participant."userId" = ${userId}
     AND participant."kind" = 'STAFF'::"MessageParticipantKind"
     AND participant."removedAt" IS NULL
    LEFT JOIN "MessageParticipantReadCursor" AS read_cursor
      ON read_cursor."tenantId" = message."tenantId"
     AND read_cursor."conversationId" = message."conversationId"
     AND read_cursor."participantId" = participant."id"
    WHERE message."tenantId" = ${tenantId}
      AND message."conversationId" IN (${Prisma.join(conversationIds)})
      AND message."senderParticipantId" <> participant."id"
      AND message."sequence" > COALESCE(read_cursor."lastReadSequence", 0)
    GROUP BY message."conversationId"
  `);
  return new Map(
    rows.map((row) => [row.conversationId, Number(row.unreadCount)]),
  );
}
