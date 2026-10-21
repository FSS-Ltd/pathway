import { NotFoundException } from "@nestjs/common";
import { type Prisma, withTenantRlsContext } from "@pathway/db";
import type { FaithActor } from "./faith-access";
import { tryUnpackDraftPayload } from "./faith-content";
import { faithStudentAge, resolveFaithReader } from "./faith-reader";

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
    const [child, enrollment, settings] = await Promise.all([
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
        select: { displayLabel: true, reflectionsEnabled: true },
      }),
    ]);
    if (!child || !enrollment)
      throw new NotFoundException("Faith content not found");
    const age = faithStudentAge(child.dateOfBirth, today);
    const where: Prisma.FaithContentVersionWhereInput = {
      tenantId: actor.tenantId,
      publishedAt: { lte: now },
      supersededBy: null,
      faithContent: { withdrawnAt: null },
      audiences: {
        some: {
          OR: [
            { type: "ALL_ACTIVE_STUDENTS" },
            ...(age === null
              ? []
              : [
                  {
                    type: "AGE_BAND" as const,
                    minimumAge: { lte: age },
                    maximumAge: { gte: age },
                  },
                ]),
          ],
        },
      },
    };
    if (query.cursor) {
      const cursor = await tx.faithContentVersion.findFirst({
        where: { ...where, id: query.cursor },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException("Faith content page not found");
    }
    const versions = await tx.faithContentVersion.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      select: {
        id: true,
        title: true,
        contentPayload: true,
        publishedAt: true,
        faithContentId: true,
      },
    });
    return {
      displayLabel: settings?.displayLabel ?? "Faith Corner",
      reflectionsEnabled:
        process.env.ACE_FAITH_REFLECTIONS_ENABLED === "true" &&
        settings?.reflectionsEnabled === true,
      nextCursor:
        versions.length > query.limit ? versions[query.limit - 1].id : null,
      items: versions.slice(0, query.limit).flatMap((version) => {
        const parsed = tryUnpackDraftPayload(version.contentPayload);
        if (!parsed) return [];
        return [
          {
            id: version.faithContentId,
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
