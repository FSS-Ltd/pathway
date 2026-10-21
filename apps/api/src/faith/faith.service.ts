import {
  ConflictException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { AuditAction } from "../audit/audit.types";
import {
  assertFaithActor,
  requireFaithStaff,
  type FaithActor,
} from "./faith-access";
import {
  auditFaith,
  authoringEnabled,
  latestFaithVersion,
  publicationEnabled,
  requireExpectedVersion,
  unpackDraftPayload,
  validateFaithAudience,
} from "./faith-content";
import type {
  CreateFaithDraft,
  PublishFaith,
  ScheduleFaith,
  UpdateFaithDraft,
} from "./faith.dto";
import { publishFaithContent } from "./faith-publication";
import {
  getFaithSettings,
  listFaithContent,
  listFaithOptions,
} from "./faith-staff-read";

@Injectable()
export class FaithService {
  list(query: { cursor?: string; limit: number }, actor: FaithActor) {
    return listFaithContent(query, actor);
  }

  options(actor: FaithActor) {
    return listFaithOptions(actor);
  }

  async create(input: CreateFaithDraft, actor: FaithActor) {
    assertFaithActor(actor);
    if (!authoringEnabled())
      throw new ServiceUnavailableException("Faith authoring is not enabled");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor);
      await validateFaithAudience(tx, actor.tenantId, input.audience);
      if (input.faithContentId) {
        await latestFaithVersion(tx, actor, input.faithContentId);
        const activeSchedule = await tx.faithContentDraft.findFirst({
          where: {
            tenantId: actor.tenantId,
            faithContentId: input.faithContentId,
            status: "DRAFT",
            scheduledAt: { not: null },
          },
          select: { id: true },
        });
        if (activeSchedule)
          throw new ConflictException(
            "Cancel the scheduled draft before creating a revision",
          );
      }
      const content = input.faithContentId
        ? { id: input.faithContentId }
        : await tx.faithContent.create({
            data: { tenantId: actor.tenantId },
            select: { id: true },
          });
      if (!content) throw new NotFoundException("Faith content not found");
      const draft = await tx.faithContentDraft.create({
        data: {
          tenantId: actor.tenantId,
          faithContentId: content.id,
          authorUserId: actor.userId,
          title: input.title,
          contentPayload: { ...input.contentPayload, audience: input.audience },
        },
        select: { id: true },
      });
      await auditFaith(tx, actor, content.id, AuditAction.CREATED, "DRAFT");
      return { id: content.id, draftId: draft.id };
    });
  }

  async updateDraft(
    id: string,
    draftId: string,
    input: UpdateFaithDraft,
    actor: FaithActor,
  ) {
    assertFaithActor(actor);
    if (!authoringEnabled())
      throw new ServiceUnavailableException("Faith authoring is not enabled");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor);
      await latestFaithVersion(tx, actor, id);
      const draft = await tx.faithContentDraft.findFirst({
        where: { id: draftId, tenantId: actor.tenantId, faithContentId: id },
      });
      if (!draft) throw new NotFoundException("Faith draft not found");
      if (
        draft.status !== "DRAFT" ||
        draft.scheduledAt ||
        draft.updatedAt.getTime() !==
          new Date(input.expectedUpdatedAt).getTime()
      ) {
        throw new ConflictException(
          "Faith draft changed before it could be edited",
        );
      }
      await validateFaithAudience(tx, actor.tenantId, input.audience);
      const updated = await tx.faithContentDraft.update({
        where: { id_tenantId: { id: draftId, tenantId: actor.tenantId } },
        data: {
          title: input.title,
          contentPayload: { ...input.contentPayload, audience: input.audience },
          scheduleFailureReason: null,
        },
        select: {
          id: true,
          title: true,
          contentPayload: true,
          updatedAt: true,
        },
      });
      await auditFaith(tx, actor, id, AuditAction.UPDATED, "DRAFT_EDITED");
      return { ...updated, ...unpackDraftPayload(updated.contentPayload) };
    });
  }

  publish(id: string, input: PublishFaith, actor: FaithActor) {
    assertFaithActor(actor);
    return publishFaithContent(id, input, actor);
  }

  publishScheduled(id: string, input: PublishFaith, actor: FaithActor) {
    assertFaithActor(actor);
    return publishFaithContent(id, input, actor, true);
  }

  async schedule(id: string, input: ScheduleFaith, actor: FaithActor) {
    assertFaithActor(actor);
    if (!publicationEnabled())
      throw new ServiceUnavailableException("Faith publication is not enabled");
    const scheduledAt = new Date(input.scheduledAt);
    if (scheduledAt <= new Date())
      throw new ConflictException("Schedule must be in the future");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor, true);
      const latest = await latestFaithVersion(tx, actor, id);
      requireExpectedVersion(latest, input.expectedVersionId);
      const draft = await tx.faithContentDraft.findFirst({
        where: {
          id: input.draftId,
          tenantId: actor.tenantId,
          faithContentId: id,
        },
      });
      if (!draft) throw new NotFoundException("Faith draft not found");
      if (draft.status !== "DRAFT" || draft.scheduledAt)
        throw new ConflictException("Faith draft cannot be scheduled");
      const existingSchedule = await tx.faithContentDraft.findFirst({
        where: {
          tenantId: actor.tenantId,
          faithContentId: id,
          status: "DRAFT",
          scheduledAt: { not: null },
        },
        select: { id: true },
      });
      if (existingSchedule)
        throw new ConflictException(
          "This content already has a scheduled draft",
        );
      const { audience } = unpackDraftPayload(draft.contentPayload);
      await validateFaithAudience(tx, actor.tenantId, audience);
      const scheduled = await tx.faithContentDraft.update({
        where: { id_tenantId: { id: draft.id, tenantId: actor.tenantId } },
        data: {
          scheduledAt,
          scheduledByUserId: actor.userId,
          scheduleExpectedVersionId: latest?.id ?? null,
          scheduleFailureReason: null,
        },
        select: { id: true, scheduledAt: true },
      });
      await auditFaith(tx, actor, id, AuditAction.UPDATED, "SCHEDULED");
      return scheduled;
    });
  }

  async cancelSchedule(
    id: string,
    input: { draftId: string },
    actor: FaithActor,
  ) {
    assertFaithActor(actor);
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor, true);
      await latestFaithVersion(tx, actor, id);
      const draft = await tx.faithContentDraft.findFirst({
        where: {
          id: input.draftId,
          tenantId: actor.tenantId,
          faithContentId: id,
        },
      });
      if (!draft) throw new NotFoundException("Faith draft not found");
      if (draft.status !== "DRAFT" || !draft.scheduledAt)
        throw new ConflictException("No scheduled draft to cancel");
      await tx.faithContentDraft.update({
        where: { id_tenantId: { id: draft.id, tenantId: actor.tenantId } },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduleExpectedVersionId: null,
          scheduleFailureReason: null,
        },
      });
      await auditFaith(
        tx,
        actor,
        id,
        AuditAction.UPDATED,
        "SCHEDULE_CANCELLED",
      );
      return { cancelled: true };
    });
  }

  async withdraw(
    id: string,
    input: { expectedVersionId: string },
    actor: FaithActor,
  ) {
    assertFaithActor(actor);
    if (!publicationEnabled())
      throw new ServiceUnavailableException("Faith publication is not enabled");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor, true);
      const latest = await latestFaithVersion(tx, actor, id);
      requireExpectedVersion(latest, input.expectedVersionId);
      const content = await tx.faithContent.findFirst({
        where: { id, tenantId: actor.tenantId },
        select: { withdrawnAt: true },
      });
      if (content?.withdrawnAt)
        throw new ConflictException("Faith content is already withdrawn");
      const result = await tx.faithContent.update({
        where: { id_tenantId: { id, tenantId: actor.tenantId } },
        data: { withdrawnAt: new Date() },
        select: { id: true, withdrawnAt: true },
      });
      await tx.faithContentDraft.updateMany({
        where: {
          tenantId: actor.tenantId,
          faithContentId: id,
          status: "DRAFT",
          scheduledAt: { not: null },
        },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduleExpectedVersionId: null,
          scheduleFailureReason: "CONTENT_WITHDRAWN",
        },
      });
      await auditFaith(tx, actor, id, AuditAction.UPDATED, "WITHDRAWN");
      return result;
    });
  }

  settings(actor: FaithActor) {
    return getFaithSettings(actor);
  }

  async updateSettings(input: { displayLabel: string }, actor: FaithActor) {
    assertFaithActor(actor);
    if (!authoringEnabled())
      throw new ServiceUnavailableException("Faith authoring is not enabled");
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      await requireFaithStaff(tx, actor, true);
      const row = await tx.faithSiteSettings.upsert({
        where: { tenantId: actor.tenantId },
        create: { tenantId: actor.tenantId, displayLabel: input.displayLabel },
        update: { displayLabel: input.displayLabel },
        select: { displayLabel: true },
      });
      await auditFaith(
        tx,
        actor,
        actor.tenantId,
        AuditAction.UPDATED,
        "SETTINGS_UPDATED",
      );
      return row;
    });
  }

  async markScheduleNeedsReview(
    draftId: string,
    expectedVersionId: string | null,
    reason: string,
    actor: FaithActor,
  ): Promise<boolean> {
    return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      const draft = await tx.faithContentDraft.findFirst({
        where: { id: draftId, tenantId: actor.tenantId },
        select: { faithContentId: true },
      });
      if (!draft) return false;
      const result = await tx.faithContentDraft.updateMany({
        where: {
          id: draftId,
          tenantId: actor.tenantId,
          status: "DRAFT",
          scheduledAt: { not: null },
          scheduledByUserId: actor.userId,
          scheduleExpectedVersionId: expectedVersionId,
        },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduleExpectedVersionId: null,
          scheduleFailureReason: reason,
        },
      });
      if (result.count === 1) {
        await auditFaith(
          tx,
          actor,
          draft.faithContentId,
          AuditAction.UPDATED,
          "SCHEDULE_NEEDS_REVIEW",
        );
      }
      return result.count === 1;
    });
  }
}
