import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";

export interface NoticeAcknowledgement {
  readAt: Date;
  acknowledgedAt: Date;
}

export async function acknowledgeNoticeReceipt(
  tx: Prisma.TransactionClient,
  tenantId: string,
  receiptId: string,
): Promise<NoticeAcknowledgement> {
  const publication = await tx.$queryRaw<{ id: string }[]>`
    SELECT notice."id"
    FROM app."AceNoticeReceipt" receipt
    JOIN app."AceNoticeAudienceMember" member
      ON member."id" = receipt."audienceMemberId"
      AND member."tenantId" = receipt."tenantId"
    JOIN app."AceNotice" notice
      ON notice."id" = member."noticeId"
      AND notice."tenantId" = member."tenantId"
    WHERE receipt."id" = ${receiptId}
      AND receipt."tenantId" = ${tenantId}
      AND notice."publishedAt" IS NOT NULL
      AND notice."withdrawnAt" IS NULL
      AND (notice."expiresAt" IS NULL
        OR notice."expiresAt" > pg_catalog.clock_timestamp())
    FOR SHARE OF notice
  `;
  if (publication.length === 0) throw new NotFoundException("Notice not found");

  const now = new Date();
  const rows = await tx.$queryRaw<NoticeAcknowledgement[]>`
    UPDATE app."AceNoticeReceipt"
    SET "readAt" = COALESCE("readAt", GREATEST(${now}, "deliveredAt")),
        "acknowledgedAt" = GREATEST(${now}, COALESCE("readAt", "deliveredAt")),
        "updatedAt" = ${now}
    WHERE "id" = ${receiptId}
      AND "tenantId" = ${tenantId}
      AND "acknowledgedAt" IS NULL
    RETURNING "readAt", "acknowledgedAt"
  `;
  if (rows[0]) return rows[0];

  const current = await tx.aceNoticeReceipt.findFirst({
    where: { id: receiptId, tenantId },
    select: { readAt: true, acknowledgedAt: true },
  });
  if (!current?.readAt || !current.acknowledgedAt) {
    throw new NotFoundException("Notice not found");
  }
  return { readAt: current.readAt, acknowledgedAt: current.acknowledgedAt };
}
