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
  return { lastReadSequence: rows[0].lastReadSequence };
}
