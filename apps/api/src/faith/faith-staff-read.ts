import { NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import {
  assertFaithActor,
  requireFaithStaff,
  type FaithActor,
} from "./faith-access";
import {
  authoringEnabled,
  publicationEnabled,
  tryUnpackDraftPayload,
} from "./faith-content";

export async function listFaithContent(
  query: { cursor?: string; limit: number },
  actor: FaithActor,
) {
  assertFaithActor(actor);
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    const { siteLead } = await requireFaithStaff(tx, actor);
    if (query.cursor) {
      const cursor = await tx.faithContent.findFirst({
        where: { id: query.cursor, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException("Faith content page not found");
    }
    const contents = await tx.faithContent.findMany({
      where: { tenantId: actor.tenantId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        withdrawnAt: true,
        drafts: {
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          select: {
            id: true,
            title: true,
            contentPayload: true,
            status: true,
            scheduledAt: true,
            scheduleFailureReason: true,
            updatedAt: true,
          },
        },
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1,
          select: {
            id: true,
            versionNumber: true,
            title: true,
            contentPayload: true,
            audiences: { select: { type: true, sourceAgeBandId: true } },
          },
        },
      },
    });
    return {
      items: contents.slice(0, query.limit).map((content) => {
        const latest = content.versions[0];
        const latestPayload = latest
          ? tryUnpackDraftPayload(latest.contentPayload)
          : null;
        const allStudents =
          latest?.audiences.length === 1 &&
          latest.audiences[0].type === "ALL_ACTIVE_STUDENTS";
        const ageBands =
          latest?.audiences.every(
            (item) => item.type === "AGE_BAND" && item.sourceAgeBandId !== null,
          ) && latest.audiences.length > 0;
        const audience = allStudents
          ? { type: "ALL_ACTIVE_STUDENTS" as const }
          : ageBands
            ? {
                type: "AGE_BAND" as const,
                ageBandIds:
                  latest?.audiences
                    .map((item) => item.sourceAgeBandId)
                    .filter((id): id is string => id !== null) ?? [],
              }
            : null;
        return {
          id: content.id,
          title: latest?.title ?? content.drafts[0]?.title ?? "Untitled",
          latestVersionId: latest?.id ?? null,
          latestVersionNumber: latest?.versionNumber ?? 0,
          withdrawnAt: content.withdrawnAt,
          drafts: content.drafts.map((draft) => {
            const parsed = tryUnpackDraftPayload(draft.contentPayload);
            return {
              id: draft.id,
              title: draft.title,
              status: draft.status,
              scheduledAt: draft.scheduledAt,
              scheduleFailureReason: draft.scheduleFailureReason,
              updatedAt: draft.updatedAt,
              contentPayload: parsed?.contentPayload ?? null,
              audience: parsed?.audience ?? null,
              needsReview: parsed === null,
            };
          }),
          publishedNeedsReview: Boolean(
            latest && (!latestPayload || !audience),
          ),
          publishedVersion:
            latest && latestPayload && audience
              ? {
                  id: latest.id,
                  title: latest.title,
                  contentPayload: latestPayload.contentPayload,
                  audience,
                }
              : null,
        };
      }),
      authoringEnabled: authoringEnabled(),
      publicationEnabled: publicationEnabled(),
      siteLead,
      nextCursor:
        contents.length > query.limit ? contents[query.limit - 1].id : null,
    };
  });
}

export async function listFaithOptions(actor: FaithActor) {
  assertFaithActor(actor);
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    await requireFaithStaff(tx, actor);
    const ageBands = await tx.faithAgeBand.findMany({
      where: { tenantId: actor.tenantId, archivedAt: null },
      orderBy: [{ minimumAge: "asc" }, { name: "asc" }],
      select: { id: true, name: true, minimumAge: true, maximumAge: true },
    });
    return { ageBands };
  });
}

export async function getFaithSettings(actor: FaithActor) {
  assertFaithActor(actor);
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    await requireFaithStaff(tx, actor);
    const row = await tx.faithSiteSettings.findUnique({
      where: { tenantId: actor.tenantId },
      select: { displayLabel: true, reflectionsEnabled: true },
    });
    return {
      displayLabel: row?.displayLabel ?? "Faith Corner",
      reflectionsEnabled: row?.reflectionsEnabled ?? false,
      reflectionFeatureAvailable:
        process.env.ACE_FAITH_REFLECTIONS_ENABLED === "true",
    };
  });
}
