import {
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { requireFaithStaff, type FaithActor } from "./faith-access";
import {
  auditFaith,
  latestFaithVersion,
  publicationEnabled,
  requireExpectedVersion,
  unpackDraftPayload,
  validateFaithAudience,
} from "./faith-content";
import type { PublishFaith } from "./faith.dto";
import { AuditAction } from "../audit/audit.types";

export async function publishFaithContent(
  contentId: string,
  input: PublishFaith,
  actor: FaithActor,
  scheduled = false,
) {
  if (!publicationEnabled())
    throw new ServiceUnavailableException("Faith publication is not enabled");
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    await requireFaithStaff(tx, actor, true);
    const latest = await latestFaithVersion(tx, actor, contentId);
    requireExpectedVersion(latest, input.expectedVersionId);
    const competingSchedule = await tx.faithContentDraft.findFirst({
      where: {
        tenantId: actor.tenantId,
        faithContentId: contentId,
        scheduledAt: { not: null },
        ...(scheduled ? { id: { not: input.draftId } } : {}),
      },
      select: { id: true },
    });
    if (competingSchedule)
      throw new ConflictException(
        "Cancel the scheduled draft before publication",
      );
    const draft = await tx.faithContentDraft.findFirst({
      where: {
        id: input.draftId,
        tenantId: actor.tenantId,
        faithContentId: contentId,
      },
    });
    if (!draft) throw new NotFoundException("Faith draft not found");
    if (
      draft.status !== "DRAFT" ||
      (scheduled
        ? !draft.scheduledAt ||
          draft.scheduledAt > new Date() ||
          draft.scheduledByUserId !== actor.userId ||
          draft.scheduleExpectedVersionId !== input.expectedVersionId
        : draft.scheduledAt !== null)
    ) {
      throw new ConflictException("Faith draft changed before publication");
    }
    const { audience, contentPayload } = unpackDraftPayload(
      draft.contentPayload,
    );
    const bands = await validateFaithAudience(tx, actor.tenantId, audience);
    if (scheduled) {
      await tx.faithContentDraft.update({
        where: { id_tenantId: { id: draft.id, tenantId: actor.tenantId } },
        data: {
          scheduledAt: null,
          scheduledByUserId: null,
          scheduleExpectedVersionId: null,
          scheduleFailureReason: null,
        },
      });
    }
    const version = await tx.faithContentVersion.create({
      data: {
        tenantId: actor.tenantId,
        faithContentId: contentId,
        sourceDraftId: draft.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        title: draft.title,
        contentPayload: { ...contentPayload, audience },
        publishedAt: new Date(),
        supersedesVersionId: latest?.id ?? null,
      },
      select: { id: true, versionNumber: true },
    });
    await tx.faithContentAudience.createMany({
      data:
        audience.type === "ALL_ACTIVE_STUDENTS"
          ? [
              {
                tenantId: actor.tenantId,
                faithContentVersionId: version.id,
                type: "ALL_ACTIVE_STUDENTS",
              },
            ]
          : bands.map((band) => ({
              tenantId: actor.tenantId,
              faithContentVersionId: version.id,
              type: "AGE_BAND" as const,
              sourceAgeBandId: band.id,
              ageBandName: band.name,
              minimumAge: band.minimumAge,
              maximumAge: band.maximumAge,
            })),
    });
    await tx.faithContent.update({
      where: { id_tenantId: { id: contentId, tenantId: actor.tenantId } },
      data: { withdrawnAt: null },
    });
    await auditFaith(tx, actor, contentId, AuditAction.UPDATED, "PUBLISHED");
    return version;
  });
}
