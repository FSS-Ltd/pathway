import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, withTenantRlsContext } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  assertNoticeActor,
  requireSiteNoticeStaffAccess,
  type NoticeActor,
} from "./ace-notice-access";
import {
  audienceVersion,
  resolveNoticeAudience,
  type NoticeRecipient,
} from "./ace-notice-audience";
import type {
  PublishNoticeDto,
  WithdrawNoticeDto,
} from "./dto/ace-notice-publication.dto";

const recipientBatchSize = 500;

@Injectable()
export class AceNoticePublicationService {
  constructor(@Inject(OutboxService) private readonly outbox: OutboxService) {}

  async preview(id: string, actor: NoticeActor) {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await requireSiteNoticeStaffAccess(tx, actor);
      const notice = await tx.aceNotice.findFirst({
        where: {
          id,
          tenantId: actor.tenantId,
          publishedAt: null,
          scheduledAt: null,
          legacyImportedAt: null,
        },
        select: { id: true, audience: true, updatedAt: true },
      });
      if (!notice) throw new NotFoundException("Notice draft not found");
      const recipients = await resolveNoticeAudience(
        tx,
        actor.tenantId,
        notice.audience,
        site.parentPortalEnabled,
        new Date(),
      );
      return {
        recipientCount: recipients.length,
        audienceVersion: audienceVersion(actor.tenantId, id, recipients),
        updatedAt: notice.updatedAt,
      };
    });
  }

  async publish(id: string, input: PublishNoticeDto, actor: NoticeActor) {
    return this.publishWithMode(id, input, actor, "immediate");
  }

  /** Called only by the authenticated due-schedule runner. */
  async publishScheduled(
    id: string,
    input: PublishNoticeDto,
    actor: NoticeActor,
  ) {
    return this.publishWithMode(id, input, actor, "scheduled");
  }

  private async publishWithMode(
    id: string,
    input: PublishNoticeDto,
    actor: NoticeActor,
    mode: "immediate" | "scheduled",
  ) {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await requireSiteNoticeStaffAccess(tx, actor);
      await this.lock(tx, actor.tenantId, id);
      await this.lockNotice(tx, actor.tenantId, id);
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId },
      });
      if (!notice) throw new NotFoundException("Notice draft not found");
      if (notice.legacyImportedAt) {
        throw new ConflictException("Historical drafts cannot be published");
      }
      if (notice.withdrawnAt) {
        throw new ConflictException("Notice was withdrawn");
      }
      if (notice.publishedAt) {
        const recipientCount = await tx.aceNoticeAudienceMember.count({
          where: { tenantId: actor.tenantId, noticeId: id },
        });
        return { id, publishedAt: notice.publishedAt, recipientCount };
      }
      if (mode === "scheduled") {
        if (
          !notice.scheduledAt ||
          notice.scheduledAt > new Date() ||
          notice.scheduledByUserId !== actor.userId
        ) {
          throw new ConflictException(
            "Notice is no longer due for publication",
          );
        }
      } else if (notice.scheduledAt) {
        throw new ConflictException(
          "Cancel the schedule before publishing now",
        );
      }
      if (
        notice.updatedAt.getTime() !==
        new Date(input.expectedUpdatedAt).getTime()
      ) {
        throw new ConflictException("Notice draft changed; refresh and retry");
      }
      const now = new Date();
      if (!notice.title.trim() || !notice.body.trim()) {
        throw new BadRequestException("Notice content is required");
      }
      if (notice.expiresAt && notice.expiresAt <= now) {
        throw new BadRequestException("Notice expiry must be in the future");
      }
      const recipients = await resolveNoticeAudience(
        tx,
        actor.tenantId,
        notice.audience,
        site.parentPortalEnabled,
        now,
      );
      if (
        recipients.length === 0 ||
        audienceVersion(actor.tenantId, id, recipients) !==
          input.expectedAudienceVersion
      ) {
        throw new ConflictException("Notice audience changed; refresh preview");
      }
      if (
        (await tx.aceNoticeAudienceMember.count({
          where: { tenantId: actor.tenantId, noticeId: id },
        })) !== 0
      ) {
        throw new ConflictException("Notice audience already exists");
      }

      await this.insertAudience(tx, actor.tenantId, id, recipients);
      await tx.aceNotice.update({
        where: { id_tenantId: { id, tenantId: actor.tenantId } },
        data: {
          publishedAt: now,
          scheduleFailedAt: null,
          scheduleFailureReason: null,
        },
      });
      const members = await tx.aceNoticeAudienceMember.findMany({
        where: { tenantId: actor.tenantId, noticeId: id },
        select: { id: true },
      });
      for (let index = 0; index < members.length; index += recipientBatchSize) {
        await tx.aceNoticeReceipt.createMany({
          data: members
            .slice(index, index + recipientBatchSize)
            .map((member) => ({
              tenantId: actor.tenantId,
              audienceMemberId: member.id,
              deliveredAt: now,
            })),
        });
      }
      await this.recordChange(tx, actor, id, "publish", {
        recipientCount: recipients.length,
      });
      return { id, publishedAt: now, recipientCount: recipients.length };
    });
  }

  async withdraw(id: string, input: WithdrawNoticeDto, actor: NoticeActor) {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      await this.lock(tx, actor.tenantId, id);
      await this.lockNotice(tx, actor.tenantId, id);
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { publishedAt: true, withdrawnAt: true },
      });
      if (!notice) throw new NotFoundException("Notice not found");
      if (!notice.publishedAt) {
        throw new ConflictException("Draft notice cannot be withdrawn");
      }
      if (notice.withdrawnAt) {
        return { id, withdrawnAt: notice.withdrawnAt };
      }
      const withdrawnAt = new Date(
        Math.max(Date.now(), notice.publishedAt.getTime()),
      );
      await tx.aceNotice.update({
        where: { id_tenantId: { id, tenantId: actor.tenantId } },
        data: { withdrawnAt },
      });
      await this.recordChange(tx, actor, id, "withdraw", {
        reason: input.reason,
      });
      return { id, withdrawnAt };
    });
  }

  private async lock(
    tx: Prisma.TransactionClient,
    tenantId: string,
    noticeId: string,
  ): Promise<void> {
    const key = `ace-notice-publication:${tenantId}:${noticeId}`;
    await tx.$executeRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }

  private async lockNotice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    noticeId: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id"
      FROM app."AceNotice"
      WHERE "id" = ${noticeId} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
  }

  private async insertAudience(
    tx: Prisma.TransactionClient,
    tenantId: string,
    noticeId: string,
    recipients: NoticeRecipient[],
  ): Promise<void> {
    for (
      let index = 0;
      index < recipients.length;
      index += recipientBatchSize
    ) {
      await tx.aceNoticeAudienceMember.createMany({
        data: recipients
          .slice(index, index + recipientBatchSize)
          .map((person) => ({
            tenantId,
            noticeId,
            ...person,
          })),
      });
    }
  }

  private async recordChange(
    tx: Prisma.TransactionClient,
    actor: NoticeActor,
    noticeId: string,
    action: "publish" | "withdraw",
    metadata: Record<string, string | number>,
  ): Promise<void> {
    await recordAuditEventInTransaction(tx, {
      actorUserId: actor.userId,
      tenantId: actor.tenantId,
      orgId: actor.orgId,
      entityType: AuditEntityType.ACE_NOTICE,
      entityId: noticeId,
      action: AuditAction.UPDATED,
      metadata: { action: `ace.notice.${action}`, ...metadata },
    });
    await this.outbox.enqueue(tx, {
      aggregateType: "ACE_NOTICE",
      aggregateId: noticeId,
      eventType: `ace.notice.${action}`,
      payload: { tenantId: actor.tenantId, noticeId },
      idempotencyKey: `ace.notice.${action}:${actor.tenantId}:${noticeId}`,
    });
  }
}
