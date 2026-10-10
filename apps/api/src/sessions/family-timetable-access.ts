import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, type Prisma } from "@pathway/db";

export type FamilyTimetableScope =
  | { kind: "parent"; childId: string }
  | { kind: "student" };

export async function requireFamilyTimetableSite(
  siteId: string,
  userId: string,
  scope: FamilyTimetableScope,
) {
  if (!siteId.trim() || !userId.trim()) {
    throw new BadRequestException("Site and authenticated user are required");
  }
  const site = await prisma.tenant.findUnique({
    where: { id: siteId },
    select: {
      orgId: true,
      timezone: true,
      org: { select: { parentPortalEnabled: true } },
    },
  });
  if (!site || (scope.kind === "parent" && !site.org.parentPortalEnabled)) {
    throw new NotFoundException("Timetable not found");
  }
  return site;
}

export async function requireFamilyTimetableChild(
  tx: Prisma.TransactionClient,
  siteId: string,
  userId: string,
  scope: FamilyTimetableScope,
) {
  const now = new Date();
  if (scope.kind === "parent") {
    const link = await tx.guardianChildRelationship.findFirst({
      where: {
        tenantId: siteId,
        childId: scope.childId,
        legalAccess: "FULL",
        startsAt: { lte: now },
        endedAt: null,
        revokedAt: null,
        guardianIdentity: {
          tenantId: siteId,
          userId,
          user: { isActive: true },
        },
        child: { tenantId: siteId, isGuest: false },
      },
      select: {
        child: {
          select: {
            id: true,
            groupId: true,
            firstName: true,
            preferredName: true,
          },
        },
      },
    });
    if (link) return link.child;
  } else {
    const [policy, links] = await Promise.all([
      tx.studentPortalPolicy.findUnique({
        where: { tenantId: siteId },
        select: { studentPortalEnabled: true },
      }),
      tx.studentIdentityLink.findMany({
        where: {
          tenantId: siteId,
          endedAt: null,
          revokedAt: null,
          linkedAt: { lte: now },
          studentIdentity: {
            tenantId: siteId,
            userId,
            user: { isActive: true },
          },
          child: { tenantId: siteId, isGuest: false },
        },
        select: {
          child: {
            select: {
              id: true,
              groupId: true,
              firstName: true,
              preferredName: true,
            },
          },
        },
        take: 2,
      }),
    ]);
    if (policy?.studentPortalEnabled && links.length === 1) {
      return links[0].child;
    }
  }
  throw new NotFoundException("Timetable not found");
}
