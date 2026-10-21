import { NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { isAceVertical } from "@pathway/types";
import { siteCalendarDate } from "../homework/homework-audience";
import type { TripSlipActor } from "./trip-slip-access";

export async function requireGuardianSlipChild(
  tx: Prisma.TransactionClient,
  actor: TripSlipActor,
  childId: string,
  now: Date,
): Promise<{ relationshipId: string; guardianIdentityId: string }> {
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
    !site?.org.parentPortalEnabled ||
    !isAceVertical(site.org.orgVertical?.vertical)
  ) {
    throw new NotFoundException("Permission slip not found");
  }
  const today = siteCalendarDate(now, site.timezone);
  const [studentIdentity, relationship, enrollment] = await Promise.all([
    tx.studentIdentity.findUnique({
      where: {
        tenantId_userId: {
          tenantId: actor.tenantId,
          userId: actor.userId,
        },
      },
      select: { id: true },
    }),
    tx.guardianChildRelationship.findFirst({
      where: {
        tenantId: actor.tenantId,
        childId,
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
      select: { id: true, guardianIdentityId: true },
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
  ]);
  if (studentIdentity || !relationship || !enrollment) {
    throw new NotFoundException("Permission slip not found");
  }
  return {
    relationshipId: relationship.id,
    guardianIdentityId: relationship.guardianIdentityId,
  };
}
