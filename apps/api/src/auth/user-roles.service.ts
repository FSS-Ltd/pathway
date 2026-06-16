import { Injectable, Logger } from "@nestjs/common";
import { OrgRole, Role, SiteRole, prisma } from "@pathway/db";
import {
  safeErrorDiagnostic,
  safeErrorStack,
} from "../common/logging/safe-diagnostics";

type RoleLookupOptions = {
  activeOrgId?: string | null;
  activeSiteId?: string | null;
  route?: string;
};

type RoleLookupLogContext = {
  route?: string;
  hasActiveOrgId: boolean;
  hasActiveSiteId: boolean;
};

export type UserRolesResponse = {
  userId: string;
  superUser: boolean;
  currentOrgIsMasterOrg: boolean;
  orgRoles: Array<{ orgId: string; role: OrgRole }>;
  siteRoles: Array<{ tenantId: string; role: SiteRole }>;
  orgMemberships: Array<{ orgId: string; orgName: string; role: OrgRole }>;
  siteMemberships: Array<{
    tenantId: string;
    tenantName: string;
    orgId: string;
    role: SiteRole;
  }>;
  hasFamilyAccess: boolean;
  hasServeAccess: boolean;
};

@Injectable()
export class UserRolesService {
  private readonly logger = new Logger(UserRolesService.name);

  async getUserRoles(
    userId: string,
    options: RoleLookupOptions = {},
  ): Promise<UserRolesResponse> {
    const logContext = {
      route: options.route,
      hasActiveOrgId: Boolean(options.activeOrgId),
      hasActiveSiteId: Boolean(options.activeSiteId),
    };

    const user = await this.runRequiredRoleLookup(
      "user.findUnique",
      logContext,
      () =>
        prisma.user.findUnique({
          where: { id: userId },
          select: {
            superUser: true,
            hasFamilyAccess: true,
            hasServeAccess: true,
            lastActiveTenantId: true,
          },
        }),
    );

    const orgMemberships = await this.runRequiredRoleLookup(
      "orgMembership.findMany",
      logContext,
      () =>
        prisma.orgMembership.findMany({
          where: { userId },
          include: {
            org: { select: { id: true, name: true, isMasterOrg: true } },
          },
        }),
    );

    const siteMemberships = await this.runRequiredRoleLookup(
      "siteMembership.findMany",
      logContext,
      () =>
        prisma.siteMembership.findMany({
          where: { userId },
          include: {
            tenant: { select: { id: true, name: true, orgId: true } },
          },
        }),
    );

    const userOrgRoles = await this.runRequiredRoleLookup(
      "userOrgRole.findMany",
      logContext,
      () =>
        prisma.userOrgRole.findMany({
          where: { userId },
          include: {
            org: { select: { id: true, name: true, isMasterOrg: true } },
          },
        }),
    );

    const userTenantRoles = await this.runRequiredRoleLookup(
      "userTenantRole.findMany",
      logContext,
      () =>
        prisma.userTenantRole.findMany({
          where: { userId },
          include: {
            tenant: { select: { id: true, name: true, orgId: true } },
          },
        }),
    );

    const orgRoles = new Map<string, OrgRole>();
    orgMemberships.forEach((membership) => {
      orgRoles.set(membership.orgId, membership.role);
    });
    userOrgRoles.forEach((role) => {
      if (!orgRoles.has(role.orgId)) {
        orgRoles.set(role.orgId, role.role);
      }
    });

    const siteRoles = new Map<string, SiteRole>();
    siteMemberships.forEach((membership) => {
      siteRoles.set(membership.tenantId, membership.role);
    });
    userTenantRoles.forEach((role) => {
      const mappedRole = this.mapRoleToSiteRole(role.role);
      if (mappedRole && !siteRoles.has(role.tenantId)) {
        siteRoles.set(role.tenantId, mappedRole);
      }
    });

    const activeSiteId =
      options.activeSiteId ??
      user?.lastActiveTenantId ??
      siteMemberships[0]?.tenantId ??
      userTenantRoles[0]?.tenantId ??
      null;

    const linkedChildrenCount = await this.runOptionalRoleLookup(
      "child.countLinkedGuardians",
      logContext,
      () =>
        prisma.child.count({
          where: {
            ...(activeSiteId ? { tenantId: activeSiteId } : {}),
            guardians: { some: { id: userId } },
          },
        }),
      0,
    );

    const siteRoleValues = Array.from(siteRoles.values());
    const hasFamilyRole = siteRoleValues.includes(SiteRole.VIEWER);
    const hasServeRole = siteRoleValues.some(
      (role) => role === SiteRole.STAFF || role === SiteRole.SITE_ADMIN,
    );

    const computedHasFamilyAccess =
      Boolean(user?.hasFamilyAccess) || hasFamilyRole || linkedChildrenCount > 0;
    const computedHasServeAccess =
      Boolean(user?.hasServeAccess) || hasServeRole;

    const firstOrgFromMemberships =
      orgMemberships[0]?.org ?? userOrgRoles[0]?.org;
    const currentOrgId =
      options.activeOrgId ?? firstOrgFromMemberships?.id ?? null;
    const currentOrg = currentOrgId
      ? orgMemberships.find((membership) => membership.orgId === currentOrgId)
          ?.org ??
        userOrgRoles.find((role) => role.orgId === currentOrgId)?.org ??
        null
      : firstOrgFromMemberships ?? null;

    return {
      userId,
      superUser: user?.superUser ?? false,
      currentOrgIsMasterOrg: currentOrg?.isMasterOrg ?? false,
      orgRoles: Array.from(orgRoles.entries()).map(([orgId, role]) => ({
        orgId,
        role,
      })),
      siteRoles: Array.from(siteRoles.entries()).map(([tenantId, role]) => ({
        tenantId,
        role,
      })),
      orgMemberships: orgMemberships.map((membership) => ({
        orgId: membership.orgId,
        orgName: membership.org.name,
        role: membership.role,
      })),
      siteMemberships: siteMemberships.map((membership) => ({
        tenantId: membership.tenantId,
        tenantName: membership.tenant.name,
        orgId: membership.tenant.orgId,
        role: membership.role,
      })),
      hasFamilyAccess: computedHasFamilyAccess,
      hasServeAccess: computedHasServeAccess,
    };
  }

  private mapRoleToSiteRole(role: Role): SiteRole | null {
    switch (role) {
      case Role.ADMIN:
        return SiteRole.SITE_ADMIN;
      case Role.TEACHER:
      case Role.COORDINATOR:
        return SiteRole.STAFF;
      case Role.PARENT:
        return SiteRole.VIEWER;
      default:
        return null;
    }
  }

  private async runRequiredRoleLookup<T>(
    operation: string,
    context: RoleLookupLogContext,
    query: () => Promise<T>,
  ): Promise<T> {
    try {
      return await query();
    } catch (error) {
      this.logRoleLookupFailure("error", operation, context, error);
      throw error;
    }
  }

  private async runOptionalRoleLookup<T>(
    operation: string,
    context: RoleLookupLogContext,
    query: () => Promise<T>,
    fallback: T,
  ): Promise<T> {
    try {
      return await query();
    } catch (error) {
      this.logRoleLookupFailure("warn", operation, context, error);
      return fallback;
    }
  }

  private logRoleLookupFailure(
    level: "error" | "warn",
    operation: string,
    context: RoleLookupLogContext,
    error: unknown,
  ): void {
    const payload = {
      message: "User role lookup database operation failed",
      route: context.route,
      operation,
      hasActiveOrgId: context.hasActiveOrgId,
      hasActiveSiteId: context.hasActiveSiteId,
      ...safeErrorDiagnostic(error),
    };

    if (level === "error") {
      this.logger.error(payload, safeErrorStack(error));
      return;
    }

    this.logger.warn(payload);
  }
}
