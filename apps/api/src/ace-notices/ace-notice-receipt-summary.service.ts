import { Injectable, NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import {
  assertNoticeActor,
  requireSiteNoticeStaffAccess,
  type NoticeActor,
} from "./ace-notice-access";

@Injectable()
export class AceNoticeReceiptSummaryService {
  async get(id: string, actor: NoticeActor) {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      const notice = await tx.aceNotice.findFirst({
        where: {
          id,
          tenantId: actor.tenantId,
          publishedAt: { not: null },
          legacyImportedAt: null,
        },
        select: { requiresAcknowledgement: true },
      });
      if (!notice) throw new NotFoundException("Notice not found");

      const audienceMember = {
        tenantId: actor.tenantId,
        noticeId: id,
      };
      const receiptScope = {
        tenantId: actor.tenantId,
        audienceMember,
      };
      const [recipientCount, deliveredCount, readCount, acknowledgedCount] =
        await Promise.all([
          tx.aceNoticeAudienceMember.count({ where: audienceMember }),
          tx.aceNoticeReceipt.count({
            where: { ...receiptScope, deliveredAt: { not: null } },
          }),
          tx.aceNoticeReceipt.count({
            where: { ...receiptScope, readAt: { not: null } },
          }),
          tx.aceNoticeReceipt.count({
            where: { ...receiptScope, acknowledgedAt: { not: null } },
          }),
        ]);
      return {
        recipientCount,
        deliveredCount,
        readCount,
        acknowledgedCount,
        requiresAcknowledgement: notice.requiresAcknowledgement,
      };
    });
  }
}
