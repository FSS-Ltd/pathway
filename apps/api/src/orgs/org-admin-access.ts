import { UnauthorizedException } from "@nestjs/common";
import { OrgRole, prisma } from "@pathway/db";

/** Authorise org-wide operations from internal records, never request claims. */
export async function assertOrgAdminAccess(
  userId: string | undefined,
  orgId: string,
  action: string,
  mode: "admin" | "operational-read" = "admin",
): Promise<string> {
  if (!userId) {
    throw new UnauthorizedException("User ID not found in request");
  }

  const membership = await prisma.orgMembership.findFirst({
    where: { userId, orgId },
    select: { role: true },
  });
  if (membership?.role === OrgRole.ORG_ADMIN) return userId;

  const legacyAdmin = await prisma.userOrgRole.findFirst({
    where: { userId, orgId, role: OrgRole.ORG_ADMIN },
    select: { id: true },
  });
  if (legacyAdmin) return userId;

  if (mode === "operational-read" && membership) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { superUser: true, isActive: true },
    });
    if (user?.superUser && user.isActive) return userId;
  }

  throw new UnauthorizedException(
    `You must be an Organisation admin to ${action}`,
  );
}
