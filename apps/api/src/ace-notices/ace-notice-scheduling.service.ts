import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext, type Prisma } from "@pathway/db";
import { recordAuditEventInTransaction } from "../audit/audit.service";
import { AuditAction, AuditEntityType } from "../audit/audit.types";
import { OutboxService } from "../common/outbox/outbox.service";
import {
  assertNoticeActor,
  requireSiteNoticeStaffAccess,
  type NoticeActor,
} from "./ace-notice-access";
import { audienceVersion, resolveNoticeAudience } from "./ace-notice-audience";
import type { ScheduleNoticeDto } from "./dto/ace-notice-publication.dto";

export type NoticeScheduleFailure =
  | "AUDIENCE_CHANGED"
  | "PUBLISHER_ACCESS_CHANGED";

@Injectable()
export class AceNoticeSchedulingService {
  constructor(@Inject(OutboxService) private readonly outbox: OutboxService) {}

  async schedule(id: string, input: ScheduleNoticeDto, actor: NoticeActor) {
    assertNoticeActor(actor);
    if ((process.env.CRON_SECRET?.length ?? 0) < 16) {
      throw new ServiceUnavailableException(
        "Scheduled publication is unavailable",
      );
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= new Date()) {
      throw new BadRequestException("Choose a future publication time");
    }
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const site = await requireSiteNoticeStaffAccess(tx, actor);
      await this.lockNotice(tx, actor.tenantId, id);
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId },
      });
      if (!notice) throw new NotFoundException("Notice draft not found");
      if (notice.legacyImportedAt || notice.publishedAt || notice.withdrawnAt) {
        throw new ConflictException("Notice is no longer a draft");
      }
      if (
        notice.scheduledAt?.getTime() === scheduledAt.getTime() &&
        notice.scheduledByUserId === actor.userId &&
        notice.scheduledAudienceVersion === input.expectedAudienceVersion
      ) {
        return { id, scheduledAt: notice.scheduledAt };
      }
      if (notice.scheduledAt) {
        throw new ConflictException("Notice is already scheduled");
      }
      if (scheduledAt <= new Date()) {
        throw new BadRequestException("Choose a future publication time");
      }
      if (
        notice.updatedAt.getTime() !==
        new Date(input.expectedUpdatedAt).getTime()
      ) {
        throw new ConflictException("Notice draft changed; refresh and retry");
      }
      if (!notice.title.trim() || !notice.body.trim()) {
        throw new BadRequestException("Notice content is required");
      }
      if (notice.expiresAt && notice.expiresAt <= scheduledAt) {
        throw new BadRequestException("Expiry must follow the scheduled time");
      }
      const recipients = await resolveNoticeAudience(
        tx,
        actor.tenantId,
        notice.audience,
        site.parentPortalEnabled,
        new Date(),
      );
      if (
        recipients.length === 0 ||
        audienceVersion(actor.tenantId, id, recipients) !==
          input.expectedAudienceVersion
      ) {
        throw new ConflictException("Notice audience changed; refresh preview");
      }
      const updated = await tx.aceNotice.update({
        where: { id_tenantId: { id, tenantId: actor.tenantId } },
        data: {
          scheduledAt,
          scheduledByUserId: actor.userId,
          scheduledAudienceVersion: input.expectedAudienceVersion,
          scheduleFailedAt: null,
          scheduleFailureReason: null,
        },
        select: { updatedAt: true },
      });
      await this.recordChange(tx, actor, id, "schedule", updated.updatedAt, {
        scheduledAt: scheduledAt.toISOString(),
        recipientCount: recipients.length,
      });
      return { id, scheduledAt };
    });
  }

  async cancel(id: string, actor: NoticeActor) {
    assertNoticeActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireSiteNoticeStaffAccess(tx, actor);
      await this.lockNotice(tx, actor.tenantId, id);
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: {
          publishedAt: true,
          scheduledAt: true,
          legacyImportedAt: true,
        },
      });
      if (!notice) throw new NotFoundException("Notice not found");
      if (notice.publishedAt || notice.legacyImportedAt) {
        throw new ConflictException("Published notices cannot be cancelled");
      }
      if (!notice.scheduledAt) return { id, scheduledAt: null };
      const updated = await tx.aceNotice.update({
        where: { id_tenantId: { id, tenantId: actor.tenantId } },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduledAudienceVersion: null,
          scheduleFailedAt: null,
          scheduleFailureReason: null,
        },
        select: { updatedAt: true },
      });
      await this.recordChange(
        tx,
        actor,
        id,
        "cancel_schedule",
        updated.updatedAt,
        {
          scheduledAt: notice.scheduledAt.toISOString(),
        },
      );
      return { id, scheduledAt: null };
    });
  }

  async markFailed(
    id: string,
    expectedUpdatedAt: Date,
    reason: NoticeScheduleFailure,
    actor: NoticeActor,
  ): Promise<boolean> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await this.lockNotice(tx, actor.tenantId, id);
      const notice = await tx.aceNotice.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { scheduledAt: true, publishedAt: true, updatedAt: true },
      });
      if (
        !notice?.scheduledAt ||
        notice.publishedAt ||
        notice.scheduledAt > new Date() ||
        notice.updatedAt.getTime() !== expectedUpdatedAt.getTime()
      )
        return false;
      const updated = await tx.aceNotice.update({
        where: { id_tenantId: { id, tenantId: actor.tenantId } },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduledAudienceVersion: null,
          scheduleFailedAt: new Date(),
          scheduleFailureReason: reason,
        },
        select: { updatedAt: true },
      });
      await this.recordChange(
        tx,
        actor,
        id,
        "schedule_failed",
        updated.updatedAt,
        {
          reason,
        },
      );
      return true;
    });
  }

  private async lockNotice(
    tx: Prisma.TransactionClient,
    tenantId: string,
    id: string,
  ): Promise<void> {
    await tx.$queryRaw`
      SELECT "id" FROM app."AceNotice"
      WHERE "id" = ${id} AND "tenantId" = ${tenantId}
      FOR UPDATE
    `;
  }

  private async recordChange(
    tx: Prisma.TransactionClient,
    actor: NoticeActor,
    noticeId: string,
    action: "schedule" | "cancel_schedule" | "schedule_failed",
    updatedAt: Date,
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
      idempotencyKey: `ace.notice.${action}:${actor.tenantId}:${noticeId}:${updatedAt.toISOString()}`,
    });
  }
}
