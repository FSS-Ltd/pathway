import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { getSystemRoleId, OrgRole, prisma, SiteRole } from "@pathway/db";

export interface RotaActor {
  userId: string;
  orgId: string;
  tenantId: string;
  isSuperUser: boolean;
}

export function rotaActorFromRequest(
  request: { authUserId?: string; authIsSuperUser?: boolean },
  orgId: string,
  tenantId: string,
): RotaActor {
  if (!request.authUserId || !orgId || !tenantId) {
    throw new UnauthorizedException("Active site and user required");
  }
  return {
    userId: request.authUserId,
    orgId,
    tenantId,
    isSuperUser: request.authIsSuperUser === true,
  };
}

@Injectable()
export class RotaAccessService {
  async canManage(actor: RotaActor): Promise<boolean> {
    if (actor.isSuperUser) return true;
    const now = new Date();
    const [siteAdmin, orgAdmin, legacyOrgAdmin, fixedManager] =
      await Promise.all([
        prisma.siteMembership.findFirst({
          where: {
            userId: actor.userId,
            tenantId: actor.tenantId,
            role: SiteRole.SITE_ADMIN,
          },
          select: { id: true },
        }),
        prisma.orgMembership.findFirst({
          where: {
            userId: actor.userId,
            orgId: actor.orgId,
            role: OrgRole.ORG_ADMIN,
          },
          select: { id: true },
        }),
        prisma.userOrgRole.findFirst({
          where: {
            userId: actor.userId,
            orgId: actor.orgId,
            role: OrgRole.ORG_ADMIN,
          },
          select: { id: true },
        }),
        prisma.userRoleAssignment.findFirst({
          where: {
            userId: actor.userId,
            orgId: actor.orgId,
            roleDefinitionId: {
              in: [
                getSystemRoleId(actor.orgId, null, "organisationHead"),
                getSystemRoleId(actor.orgId, actor.tenantId, "siteLead"),
              ],
            },
            roleDefinition: { isSystem: true, isActive: true },
            startsAt: { lte: now },
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            revokedAt: null,
          },
          select: { id: true },
        }),
      ]);
    return Boolean(siteAdmin || orgAdmin || legacyOrgAdmin || fixedManager);
  }

  async assertManager(actor: RotaActor): Promise<void> {
    if (!(await this.canManage(actor))) {
      throw new ForbiddenException("Rota management is not available");
    }
  }
}
