import { randomUUID } from "node:crypto";
import type { Prisma } from "@pathway/db";

export async function advanceMessageReadCursor(
  tx: Prisma.TransactionClient,
  siteId: string,
  conversationId: string,
  participantId: string,
  sequence: number,
): Promise<{ lastReadSequence: number }> {
  const rows = await tx.$queryRaw<Array<{ lastReadSequence: number }>>`
    INSERT INTO "MessageParticipantReadCursor" (
      "id", "tenantId", "conversationId", "participantId", "lastReadSequence"
    ) VALUES (
      ${randomUUID()}, ${siteId}, ${conversationId}, ${participantId}, ${sequence}
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
  const readAt = new Date();
  await tx.$executeRaw`
    UPDATE "MessageDelivery" AS delivery
    SET "status" = 'READ',
        "deliveredAt" = COALESCE(delivery."deliveredAt", ${readAt}),
        "readAt" = GREATEST(COALESCE(delivery."deliveredAt", ${readAt}), ${readAt}),
        "updatedAt" = ${readAt}
    FROM "Message" AS message
    WHERE message."id" = delivery."messageId"
      AND message."tenantId" = ${siteId}
      AND message."conversationId" = ${conversationId}
      AND message."sequence" <= ${rows[0].lastReadSequence}
      AND delivery."tenantId" = ${siteId}
      AND delivery."recipientParticipantId" = ${participantId}
      AND delivery."status" <> 'READ'
  `;
  return { lastReadSequence: rows[0].lastReadSequence };
}
