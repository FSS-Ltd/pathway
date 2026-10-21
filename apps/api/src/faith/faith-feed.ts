import { NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import type { FaithActor } from "./faith-access";
import { tryUnpackDraftPayload } from "./faith-content";
import { faithAudienceIncludesAge, resolveFaithReader } from "./faith-reader";

export async function readFaithFeed(
  query: { childId?: string; cursor?: string; limit: number },
  actor: FaithActor,
) {
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    const now = new Date();
    const { reader, today } = await resolveFaithReader(
      tx,
      actor,
      query.childId,
      now,
    );
    if (query.cursor) {
      const cursor = await tx.faithContent.findFirst({
        where: { id: query.cursor, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException("Faith content page not found");
    }
    const [child, enrollment, settings, contents] = await Promise.all([
      tx.child.findFirst({
        where: { id: reader.childId, tenantId: actor.tenantId, isGuest: false },
        select: { dateOfBirth: true },
      }),
      tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId: reader.childId,
          startsOn: { lte: today },
          OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        },
        select: { id: true },
      }),
      tx.faithSiteSettings.findUnique({
        where: { tenantId: actor.tenantId },
        select: { displayLabel: true },
      }),
      tx.faithContent.findMany({
        where: { tenantId: actor.tenantId, withdrawnAt: null },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: query.limit + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          versions: {
            where: { publishedAt: { lte: now } },
            orderBy: { versionNumber: "desc" },
            take: 1,
            select: {
              id: true,
              title: true,
              contentPayload: true,
              publishedAt: true,
              audiences: {
                select: { type: true, minimumAge: true, maximumAge: true },
              },
            },
          },
        },
      }),
    ]);
    if (!child || !enrollment)
      throw new NotFoundException("Faith content not found");
    return {
      displayLabel: settings?.displayLabel ?? "Faith Corner",
      nextCursor:
        contents.length > query.limit ? contents[query.limit - 1].id : null,
      items: contents.slice(0, query.limit).flatMap((content) => {
        const version = content.versions[0];
        if (!version) return [];
        if (
          !faithAudienceIncludesAge(version.audiences, child.dateOfBirth, today)
        )
          return [];
        const parsed = tryUnpackDraftPayload(version.contentPayload);
        if (!parsed) return [];
        return [
          {
            id: content.id,
            versionId: version.id,
            title: version.title,
            contentPayload: parsed.contentPayload,
            publishedAt: version.publishedAt,
          },
        ];
      }),
    };
  });
}
