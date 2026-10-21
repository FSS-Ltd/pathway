import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { isAceVertical } from "@pathway/types";
import { siteCalendarDate } from "../homework/homework-audience";
import { requireCurrentStudent } from "../student-self/current-student";
import type { FaithActor } from "./faith-access";

export type FaithReader =
  | { kind: "STUDENT"; childId: string; studentIdentityId: string }
  | { kind: "GUARDIAN"; childId: string };

export async function resolveFaithReader(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  requestedChildId?: string,
  now = new Date(),
): Promise<{ reader: FaithReader; today: Date }> {
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
  if (!site || !isAceVertical(site.org.orgVertical?.vertical)) {
    throw new NotFoundException("Faith content not found");
  }
  const today = siteCalendarDate(now, site.timezone);
  const studentIdentity = await tx.studentIdentity.findUnique({
    where: {
      tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
    },
    select: { id: true },
  });
  if (requestedChildId) {
    if (!site.org.parentPortalEnabled || studentIdentity) {
      throw new NotFoundException("Faith content not found");
    }
    const relationship = await tx.guardianChildRelationship.findFirst({
      where: {
        tenantId: actor.tenantId,
        childId: requestedChildId,
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
    });
    if (!relationship) throw new NotFoundException("Faith content not found");
    return { reader: { kind: "GUARDIAN", childId: requestedChildId }, today };
  }
  const student = await requireCurrentStudent(
    tx,
    actor.tenantId,
    actor.userId,
    now,
    today.toISOString().slice(0, 10),
    "Faith content not found",
  );
  if (!studentIdentity) throw new NotFoundException("Faith content not found");
  return {
    reader: {
      kind: "STUDENT",
      childId: student.id,
      studentIdentityId: studentIdentity.id,
    },
    today,
  };
}

export function faithAudienceIncludesAge(
  audiences: ReadonlyArray<{
    type: string;
    minimumAge: number | null;
    maximumAge: number | null;
  }>,
  birth: Date | null,
  today: Date,
): boolean {
  const birthdayThisYear = birth
    ? new Date(
        Date.UTC(
          today.getUTCFullYear(),
          birth.getUTCMonth(),
          birth.getUTCDate(),
        ),
      )
    : null;
  const age =
    birth && birthdayThisYear
      ? today.getUTCFullYear() -
        birth.getUTCFullYear() -
        (today < birthdayThisYear ? 1 : 0)
      : null;
  return audiences.some(
    (audience) =>
      audience.type === "ALL_ACTIVE_STUDENTS" ||
      (age !== null &&
        audience.type === "AGE_BAND" &&
        audience.minimumAge !== null &&
        audience.maximumAge !== null &&
        age >= audience.minimumAge &&
        age <= audience.maximumAge),
  );
}
