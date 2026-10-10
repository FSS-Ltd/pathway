import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@pathway/db";

export interface NoticeActor {
  tenantId: string;
  orgId: string;
  userId: string;
}

export function assertNoticeActor(actor: NoticeActor): void {
  if (
    !actor.tenantId?.trim() ||
    !actor.orgId?.trim() ||
    !actor.userId?.trim()
  ) {
    throw new BadRequestException("A complete active-site actor is required");
  }
}

export async function requireAceNoticeAuthor(
  tx: Prisma.TransactionClient,
  actor: NoticeActor,
): Promise<{ parentPortalEnabled: boolean }> {
  const [site, vertical, membership, student] = await Promise.all([
    tx.tenant.findFirst({
      where: { id: actor.tenantId, orgId: actor.orgId },
      select: { org: { select: { parentPortalEnabled: true } } },
    }),
    tx.orgVertical.findFirst({
      where: { orgId: actor.orgId, vertical: "ACE_SCHOOL" },
      select: { orgId: true },
    }),
    tx.siteMembership.findFirst({
      where: { tenantId: actor.tenantId, userId: actor.userId },
      select: { id: true },
    }),
    tx.studentIdentity.findFirst({
      where: { tenantId: actor.tenantId, userId: actor.userId },
      select: { id: true },
    }),
  ]);
  if (!site || !vertical) throw new NotFoundException("ACE site not found");
  if (!membership || student) {
    throw new ForbiddenException("ACE notice author access denied");
  }
  return { parentPortalEnabled: site.org.parentPortalEnabled };
}
