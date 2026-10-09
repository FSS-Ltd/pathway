import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  getSystemRoleId,
  OrgRole,
  prisma,
  type Prisma,
  Role,
  SiteRole,
} from "@pathway/db";

const staffRoles = [
  Role.ADMIN,
  Role.COORDINATOR,
  Role.TEACHER,
  Role.LEAD,
  Role.SUPPORT,
];

export function staffAtSite(
  tenantId: string,
  userId?: string,
): Prisma.UserWhereInput {
  return {
    ...(userId ? { id: userId } : {}),
    isActive: true,
    OR: [
      {
        siteMemberships: {
          some: {
            tenantId,
            role: { in: [SiteRole.STAFF, SiteRole.SITE_ADMIN] },
          },
        },
      },
      { roles: { some: { tenantId, role: { in: staffRoles } } } },
    ],
  };
}

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

  async assertTeamViewer(actor: RotaActor): Promise<void> {
    const activeUser = await prisma.user.findFirst({
      where: { id: actor.userId, isActive: true },
      select: { id: true },
    });
    if (!activeUser) {
      throw new ForbiddenException("Team rota is not available");
    }
    if (await this.canManage(actor)) return;
    const staff = await prisma.user.findFirst({
      where: staffAtSite(actor.tenantId, actor.userId),
      select: { id: true },
    });
    if (!staff) {
      throw new ForbiddenException("Team rota is not available");
    }
  }

  async assertSessionVisible(
    actor: RotaActor,
    sessionId: string,
  ): Promise<void> {
    if (await this.canManage(actor)) return;
    const assignment = await prisma.assignment.findFirst({
      where: {
        sessionId,
        userId: actor.userId,
        session: { tenantId: actor.tenantId },
      },
      select: { id: true },
    });
    if (!assignment) throw new NotFoundException("Session not found");
  }
}
