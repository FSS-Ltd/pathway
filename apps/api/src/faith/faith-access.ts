import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";

export interface FaithActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export function assertFaithActor(actor: FaithActor): void {
  if (!actor.tenantId || !actor.orgId || !actor.userId) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

export async function requireFaithStaff(
  tx: Prisma.TransactionClient,
  actor: FaithActor,
  leaderOnly = false,
): Promise<{ siteLead: boolean }> {
  const [site, user, membership] = await Promise.all([
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
  ]);
  if (
    !site ||
    !["ACE_SCHOOL", "ACE_LEARNING_CENTRE"].includes(
      site.org.orgVertical?.vertical ?? "",
    )
  ) {
    throw new NotFoundException("ACE site not found");
  }
  if (
    !user ||
    !membership ||
    (membership.role !== "STAFF" && membership.role !== "SITE_ADMIN") ||
    (leaderOnly && membership.role !== "SITE_ADMIN")
  ) {
    throw new ForbiddenException("Faith content access denied");
  }
  return { siteLead: membership.role === "SITE_ADMIN" };
}
