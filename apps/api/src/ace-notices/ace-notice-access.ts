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

export async function requireSiteNoticeStaffAccess(
  tx: Prisma.TransactionClient,
  actor: NoticeActor,
): Promise<{
  parentPortalEnabled: boolean;
  vertical: string | null;
  timezone: string | null;
}> {
  const [site, membership, student] = await Promise.all([
    tx.tenant.findFirst({
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
  if (!site) throw new NotFoundException("Site not found");
  if (!membership || student) {
    throw new ForbiddenException("Site notice staff access denied");
  }
  return {
    parentPortalEnabled: site.org.parentPortalEnabled,
    vertical: site.org.orgVertical?.vertical ?? null,
    timezone: site.timezone,
  };
}
