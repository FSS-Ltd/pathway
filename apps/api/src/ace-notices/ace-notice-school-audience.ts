import { BadRequestException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type { NoticeRecipient } from "./ace-notice-audience";

export type NoticeAudienceScope = "SITE" | "YEAR_BAND" | "GROUP" | "CHILD";
export interface NoticeAudienceTarget {
  audienceScope: NoticeAudienceScope;
  audienceTargetId: string | null;
}

export function noticeLocalDate(now: Date, timezone: string | null): Date {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone ?? "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: "year" | "month" | "day") =>
    parts.find((value) => value.type === type)?.value;
  return new Date(
    `${part("year")}-${part("month")}-${part("day")}T00:00:00.000Z`,
  );
}

export function noticeAudienceTarget(
  audienceScope: string,
  audienceTargetId: string | null,
): NoticeAudienceTarget {
  if (
    audienceScope !== "SITE" &&
    audienceScope !== "YEAR_BAND" &&
    audienceScope !== "GROUP" &&
    audienceScope !== "CHILD"
  ) {
    throw new BadRequestException("Invalid notice audience scope");
  }
  return { audienceScope, audienceTargetId };
}

export function assertSchoolAudienceChoice(
  audience: "PARENTS" | "STAFF" | "PARENTS_AND_STAFF",
  target: NoticeAudienceTarget,
): void {
  if (
    target.audienceScope !== "SITE" &&
    target.audienceScope !== "YEAR_BAND" &&
    audience !== "PARENTS"
  ) {
    throw new BadRequestException(
      "Group and child notices can only address guardians",
    );
  }
}

export async function resolveSchoolNoticeAudience(
  tx: Prisma.TransactionClient,
  tenantId: string,
  audience: "PARENTS" | "STAFF" | "PARENTS_AND_STAFF",
  parentPortalEnabled: boolean,
  now: Date,
  target: NoticeAudienceTarget,
): Promise<NoticeRecipient[]> {
  assertSchoolAudienceChoice(audience, target);
  const vertical = await tx.tenant.findFirst({
    where: { id: tenantId, org: { orgVertical: { vertical: "ACE_SCHOOL" } } },
    select: { id: true, timezone: true },
  });
  if (!vertical) {
    throw new BadRequestException(
      "School audiences require an ACE school site",
    );
  }
  const id = target.audienceTargetId;
  if (!id) throw new BadRequestException("Choose a school audience target");
  const today = noticeLocalDate(now, vertical.timezone);
  let childIds: string[];
  if (target.audienceScope === "YEAR_BAND") {
    const band = await tx.aceYearBand.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!band) throw new NotFoundException("School class not found");
    const enrollments = await tx.aceSchoolEnrollment.findMany({
      where: {
        tenantId,
        yearBandId: id,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
        child: { isGuest: false },
      },
      select: { childId: true },
    });
    childIds = enrollments.map((row) => row.childId);
  } else if (target.audienceScope === "GROUP") {
    const group = await tx.group.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!group) throw new NotFoundException("School group not found");
    const children = await tx.child.findMany({
      where: { tenantId, groupId: id, isGuest: false },
      select: { id: true },
    });
    childIds = children.map((row) => row.id);
  } else {
    const child = await tx.child.findFirst({
      where: { id, tenantId, isGuest: false },
      select: { id: true },
    });
    if (!child) throw new NotFoundException("Child not found");
    childIds = [child.id];
  }

  const recipients = new Map<string, NoticeRecipient>();
  if (audience !== "PARENTS") {
    const assignments = await tx.aceStaffYearBandAssignment.findMany({
      where: {
        tenantId,
        yearBandId: id,
        startsOn: { lte: today },
        OR: [{ endsOn: null }, { endsOn: { gte: today } }],
      },
      select: { userId: true },
    });
    const staffIds = [...new Set(assignments.map((row) => row.userId))];
    const staff = staffIds.length
      ? await tx.siteMembership.findMany({
          where: {
            tenantId,
            userId: { in: staffIds },
            user: {
              isActive: true,
              studentIdentities: { none: { tenantId } },
            },
          },
          select: { userId: true },
        })
      : [];
    for (const member of staff) {
      recipients.set(member.userId, {
        recipientUserId: member.userId,
        recipientKind: "STAFF",
        guardianIdentityId: null,
      });
    }
  }

  if (audience !== "STAFF" && parentPortalEnabled && childIds.length) {
    const permission = await tx.permissionDefinition.findUnique({
      where: { key: "ace.parent.notices.read" },
      select: { isActive: true },
    });
    if (permission?.isActive) {
      const relationships = await tx.guardianChildRelationship.findMany({
        where: {
          tenantId,
          childId: { in: childIds },
          legalAccess: "FULL",
          startsAt: { lte: now },
          endedAt: null,
          revokedAt: null,
          guardianIdentity: {
            user: {
              isActive: true,
              studentIdentities: { none: { tenantId } },
            },
          },
        },
        select: {
          childId: true,
          guardianIdentity: { select: { id: true, userId: true } },
        },
      });
      for (const link of relationships) {
        const guardian = link.guardianIdentity;
        const prior = recipients.get(guardian.userId);
        recipients.set(guardian.userId, {
          recipientUserId: guardian.userId,
          recipientKind: "GUARDIAN",
          guardianIdentityId: guardian.id,
          targetedChildIds: [...(prior?.targetedChildIds ?? []), link.childId],
        });
      }
    }
  }
  return [...recipients.values()]
    .map((recipient) => ({
      ...recipient,
      ...(recipient.targetedChildIds
        ? { targetedChildIds: [...new Set(recipient.targetedChildIds)].sort() }
        : {}),
    }))
    .sort((a, b) => a.recipientUserId.localeCompare(b.recipientUserId));
}
