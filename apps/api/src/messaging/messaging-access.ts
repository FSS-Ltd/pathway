import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";

export const STAFF_CONVERSATION_KINDS = ["STAFF_DIRECT", "STAFF_ROOM"] as const;

export interface MessagingActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export function assertMessagingActor(actor: MessagingActor): void {
  if (
    !actor.tenantId?.trim() ||
    !actor.orgId?.trim() ||
    !actor.userId?.trim()
  ) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

export async function requireCurrentStaff(
  tx: Prisma.TransactionClient,
  actor: MessagingActor,
): Promise<void> {
  const [site, membership, student, user] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { id: true },
    }),
    tx.siteMembership.findUnique({
      where: {
        tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
        role: { in: ["SITE_ADMIN", "STAFF"] },
      },
      select: { id: true },
    }),
    tx.studentIdentity.findUnique({
      where: {
        tenantId_userId: { tenantId: actor.tenantId, userId: actor.userId },
      },
      select: { id: true },
    }),
    tx.user.findFirst({
      where: { id: actor.userId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!site) throw new NotFoundException("Active site not found");
  if (!membership || student || !user)
    throw new ForbiddenException("Staff messaging unavailable");
}
