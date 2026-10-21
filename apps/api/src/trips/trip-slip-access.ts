import { ForbiddenException, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { isAceVertical } from "@pathway/types";

export interface TripSlipActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export async function requireTripSlipStaff(
  tx: Prisma.TransactionClient,
  actor: TripSlipActor,
  leaderOnly = false,
): Promise<void> {
  const [site, user, membership, orgMembership] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: {
        org: { select: { orgVertical: { select: { vertical: true } } } },
      },
    }),
    tx.user.findFirst({
      where: { id: actor.userId, isActive: true },
      select: { id: true },
    }),
    tx.siteMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
      },
      select: { role: true },
    }),
    tx.orgMembership.findUnique({
      where: { orgId_userId: { orgId: actor.orgId, userId: actor.userId } },
      select: { role: true },
    }),
  ]);
  if (!site || !isAceVertical(site.org.orgVertical?.vertical)) {
    throw new NotFoundException("School trip not found");
  }
  const orgHead = orgMembership?.role === "ORG_ADMIN";
  const siteLead = membership?.role === "SITE_ADMIN";
  const staff = membership?.role === "STAFF";
  if (
    !user ||
    (leaderOnly ? !siteLead && !orgHead : !siteLead && !orgHead && !staff)
  ) {
    throw new ForbiddenException("School trip access denied");
  }
}
