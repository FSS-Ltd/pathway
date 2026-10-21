import { NotFoundException } from "@nestjs/common";
import { withTenantRlsContext } from "@pathway/db";
import { isAceVertical } from "@pathway/types";
import { siteCalendarDate } from "../homework/homework-audience";
import { requireCurrentStudent } from "../student-self/current-student";
import type { FaithActor } from "./faith-access";
import { tryUnpackDraftPayload } from "./faith-content";

function yearsOld(birth: Date, today: Date): number {
  const birthYear = birth.getUTCFullYear();
  const birthdayThisYear = new Date(
    Date.UTC(today.getUTCFullYear(), birth.getUTCMonth(), birth.getUTCDate()),
  );
  return (
    today.getUTCFullYear() - birthYear - (today < birthdayThisYear ? 1 : 0)
  );
}

export async function readFaithFeed(
  query: { childId?: string; cursor?: string; limit: number },
  actor: FaithActor,
) {
  return withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
    const site = await tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: {
        timezone: true,
        org: {
          select: {
            parentPortalEnabled: true,
            orgVertical: { select: { vertical: true } },
          },
        },
      },
    });
    if (
      !site ||
      !isAceVertical(site.org.orgVertical?.vertical) ||
      (query.childId && !site.org.parentPortalEnabled)
    ) {
      throw new NotFoundException("Faith content not found");
    }
    const now = new Date();
    const today = siteCalendarDate(now, site.timezone);
    let childId: string;
    if (query.childId) {
      const [relationship, student] = await Promise.all([
        tx.guardianChildRelationship.findFirst({
          where: {
            tenantId: actor.tenantId,
            childId: query.childId,
            legalAccess: "FULL",
            startsAt: { lte: now },
            endedAt: null,
            revokedAt: null,
            guardianIdentity: {
              tenantId: actor.tenantId,
              userId: actor.userId,
              user: { isActive: true },
            },
            child: { isGuest: false },
          },
          select: { id: true },
        }),
        tx.studentIdentity.findUnique({
          where: {
            tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
          },
          select: { id: true },
        }),
      ]);
      if (!relationship || student)
        throw new NotFoundException("Faith content not found");
      childId = query.childId;
    } else {
      const student = await requireCurrentStudent(
        tx,
        actor.tenantId,
        actor.userId,
        now,
        today.toISOString().slice(0, 10),
        "Faith content not found",
      );
      childId = student.id;
    }
    if (query.cursor) {
      const cursor = await tx.faithContent.findFirst({
        where: { id: query.cursor, tenantId: actor.tenantId },
        select: { id: true },
      });
      if (!cursor) throw new NotFoundException("Faith content page not found");
    }
    const [child, enrollment, settings, contents] = await Promise.all([
      tx.child.findFirst({
        where: { id: childId, tenantId: actor.tenantId, isGuest: false },
        select: { dateOfBirth: true },
      }),
      tx.aceSchoolEnrollment.findFirst({
        where: {
          tenantId: actor.tenantId,
          childId,
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
    const age = child.dateOfBirth ? yearsOld(child.dateOfBirth, today) : null;
    return {
      displayLabel: settings?.displayLabel ?? "Faith Corner",
      nextCursor:
        contents.length > query.limit ? contents[query.limit - 1].id : null,
      items: contents.slice(0, query.limit).flatMap((content) => {
        const version = content.versions[0];
        if (!version) return [];
        const visible = version.audiences.some(
          (audience) =>
            audience.type === "ALL_ACTIVE_STUDENTS" ||
            (age !== null &&
              audience.type === "AGE_BAND" &&
              audience.minimumAge !== null &&
              audience.maximumAge !== null &&
              age >= audience.minimumAge &&
              age <= audience.maximumAge),
        );
        if (!visible) return [];
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
