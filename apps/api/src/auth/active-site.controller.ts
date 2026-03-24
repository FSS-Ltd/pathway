import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { prisma, OrgRole, SiteRole, Role } from "@pathway/db";
import { AuthUserGuard } from "./auth-user.guard";

interface AuthenticatedRequest extends Request {
  authUserId?: string;
  authCookies?: Record<string, string>;
  __pathwayContext?: {
    tenant?: { tenantId?: string; orgId?: string };
    org?: { orgId?: string };
    siteRole?: string | null;
    roles?: { org?: string[]; tenant?: string[] };
  };
}

const ACTIVE_SITE_COOKIE = "pw_active_site_id";
const ACTIVE_ORG_COOKIE = "pw_active_org_id";
const ORG_ADMIN_ROLES = [OrgRole.ORG_ADMIN, OrgRole.ORG_BILLING];

type SiteSummary = {
  id: string;
  name: string;
  orgId: string;
  orgName: string | null;
  orgSlug?: string | null;
  role?: SiteRole | null;
  timezone?: string | null;
};

@Controller("auth/active-site")
export class ActiveSiteController {
  @UseGuards(AuthUserGuard)
  @Get()
  async getActiveSite(@Req() req: AuthenticatedRequest) {
    const userId = req.authUserId;
    
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user");
    }
    
    // Get user's accessible sites
    const sites = await this.listSitesForUser(userId);
    
    // Get user's last active tenant
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveTenantId: true },
    });

    let activeSiteId = sites.find(
      (site) => site.id === user?.lastActiveTenantId,
    )?.id;

    // Auto-select if only one site
    if (!activeSiteId && sites.length === 1) {
      activeSiteId = sites[0]?.id ?? null;
      if (activeSiteId) {
        await prisma.user.update({
          where: { id: userId },
          data: { lastActiveTenantId: activeSiteId },
        });
      }
    }
    
    return { activeSiteId: activeSiteId ?? null, sites };
  }

  private async listSitesForUser(userId: string): Promise<SiteSummary[]> {
    const directMemberships = await prisma.siteMembership.findMany({
      where: { userId },
      include: {
        tenant: {
          include: { org: true },
        },
      },
    });

    const orgMemberships = await prisma.orgMembership.findMany({
      where: { userId, role: { in: ORG_ADMIN_ROLES } },
    });

    const orgTenantIds =
      orgMemberships.length > 0
        ? await prisma.tenant.findMany({
            where: { orgId: { in: orgMemberships.map((m) => m.orgId) } },
            include: { org: true },
          })
        : [];

    const combined = [
      ...directMemberships.map<SiteSummary>((m) => ({
        id: m.tenantId,
        name: m.tenant.name,
        orgId: m.tenant.orgId,
        orgName: m.tenant.org.name,
        orgSlug: m.tenant.org.slug,
        role: m.role,
        timezone: m.tenant.timezone ?? null,
      })),
      ...orgTenantIds.map<SiteSummary>((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        orgId: tenant.orgId,
        orgName: tenant.org.name,
        orgSlug: tenant.org.slug,
        role: SiteRole.SITE_ADMIN,
        timezone: tenant.timezone ?? null,
      })),
    ];

    // De-dupe by tenantId
    const seen = new Map<string, SiteSummary>();
    combined.forEach((site) => {
      if (!seen.has(site.id)) {
        seen.set(site.id, site);
      }
    });

    return Array.from(seen.values()).sort((a, b) =>
      (a.orgName ?? "").localeCompare(b.orgName ?? "") ||
      a.name.localeCompare(b.name),
    );
  }

  @UseGuards(AuthUserGuard)
  @Post()
  async setActiveSite(
    @Req() req: AuthenticatedRequest,
    @Body() body: { siteId?: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const userId = req.authUserId;
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user");
    }
    if (!body?.siteId) {
      throw new UnauthorizedException("siteId is required");
    }

    const sites = await this.listSitesForUser(userId);
    const hasAccess = sites.some((site) => site.id === body.siteId);

    if (!hasAccess) {
      throw new UnauthorizedException("Site not accessible for this user");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveTenantId: body.siteId },
    });

    const result = { activeSiteId: body.siteId, sites };
    const selectedSite = sites.find((s) => s.id === body.siteId);
    
    this.setActiveSiteCookies(res, {
      siteId: body.siteId,
      orgId: selectedSite?.orgId ?? null,
    });

    return result;
  }

  /**
   * Returns the resolved auth context for the current request.
   * Use for debugging: shows what the AuthUserGuard resolved (siteRole, tenantId, etc.)
   * and whether cookies were received.
   */
  @UseGuards(AuthUserGuard)
  @Get("debug-context")
  async getDebugContext(@Req() req: AuthenticatedRequest) {
    const userId = req.authUserId;
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user");
    }
    const ctx = req.__pathwayContext;
    const cookieSiteId = req.cookies?.pw_active_site_id;
    const cookieOrgId = req.cookies?.pw_active_org_id;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveTenantId: true },
    });
    const siteMemberships = await prisma.siteMembership.findMany({
      where: { userId },
      select: { tenantId: true, role: true },
    });
    const orgMemberships = await prisma.orgMembership.findMany({
      where: { userId },
      select: { orgId: true, role: true },
    });
    return {
      resolvedContext: ctx
        ? {
            tenantId: ctx.tenant?.tenantId ?? null,
            orgId: ctx.org?.orgId ?? ctx.tenant?.orgId ?? null,
            siteRole: ctx.siteRole ?? null,
            rolesOrg: ctx.roles?.org ?? [],
            rolesTenant: ctx.roles?.tenant ?? [],
          }
        : null,
      cookies: {
        pw_active_site_id: cookieSiteId ?? "(not set)",
        pw_active_org_id: cookieOrgId ?? "(not set)",
      },
      userLastActiveTenantId: user?.lastActiveTenantId ?? null,
      dbSiteMemberships: siteMemberships.map((m) => ({
        tenantId: m.tenantId,
        role: m.role,
      })),
      dbOrgMemberships: orgMemberships.map((m) => ({
        orgId: m.orgId,
        role: m.role,
      })),
    };
  }

  @UseGuards(AuthUserGuard)
  @Get("roles")
  async getUserRoles(@Req() req: AuthenticatedRequest) {
    const userId = req.authUserId;
    if (!userId) {
      throw new UnauthorizedException("Missing authenticated user");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        superUser: true,
        hasFamilyAccess: true,
        hasServeAccess: true,
        lastActiveTenantId: true,
      },
    });

    // Get user's org memberships to determine org roles
    const orgMemberships = await prisma.orgMembership.findMany({
      where: { userId },
      include: { org: { select: { id: true, name: true, isMasterOrg: true } } },
    });

    // Get user's site memberships to determine site roles
    const siteMemberships = await prisma.siteMembership.findMany({
      where: { userId },
      include: { tenant: { select: { id: true, name: true, orgId: true } } },
    });

    // Also check legacy UserOrgRole and UserTenantRole tables for backward compatibility
    const userOrgRoles = await prisma.userOrgRole.findMany({
      where: { userId },
      include: { org: { select: { id: true, name: true, isMasterOrg: true } } },
    });

    const userTenantRoles = await prisma.userTenantRole.findMany({
      where: { userId },
      include: { tenant: { select: { id: true, name: true, orgId: true } } },
    });

    // Combine org roles from both sources
    const orgRoles = new Map<string, OrgRole>();
    orgMemberships.forEach((m) => {
      orgRoles.set(m.orgId, m.role);
    });
    userOrgRoles.forEach((r) => {
      // Only set if not already present (memberships take precedence)
      if (!orgRoles.has(r.orgId)) {
        orgRoles.set(r.orgId, r.role);
      }
    });

    // Combine site roles from both sources
    const siteRoles = new Map<string, SiteRole>();
    siteMemberships.forEach((m) => {
      siteRoles.set(m.tenantId, m.role);
    });
    userTenantRoles.forEach((r) => {
      // Map legacy Role enum to SiteRole
      const mappedRole = this.mapRoleToSiteRole(r.role);
      if (mappedRole && !siteRoles.has(r.tenantId)) {
        siteRoles.set(r.tenantId, mappedRole);
      }
    });

    const cookieSiteId = req.cookies?.[ACTIVE_SITE_COOKIE];
    const activeSiteId =
      cookieSiteId ??
      user?.lastActiveTenantId ??
      siteMemberships[0]?.tenantId ??
      userTenantRoles[0]?.tenantId ??
      null;

    const linkedChildrenCount = await prisma.child.count({
      where: {
        ...(activeSiteId ? { tenantId: activeSiteId } : {}),
        guardians: { some: { id: userId } },
      },
    });

    const siteRoleValues = Array.from(siteRoles.values());
    const hasFamilyRole = siteRoleValues.includes(SiteRole.VIEWER);
    const hasServeRole = siteRoleValues.some(
      (role) => role === SiteRole.STAFF || role === SiteRole.SITE_ADMIN,
    );

    const computedHasFamilyAccess =
      Boolean(user?.hasFamilyAccess) || hasFamilyRole || linkedChildrenCount > 0;
    const computedHasServeAccess =
      Boolean(user?.hasServeAccess) || hasServeRole;

    const cookieOrgId = req.cookies?.pw_active_org_id;
    const firstOrgFromMemberships = orgMemberships[0]?.org ?? userOrgRoles[0]?.org;
    const currentOrgId = cookieOrgId ?? firstOrgFromMemberships?.id ?? null;
    const currentOrg = currentOrgId
      ? orgMemberships.find((m) => m.orgId === currentOrgId)?.org ??
        userOrgRoles.find((r) => r.orgId === currentOrgId)?.org ??
        null
      : firstOrgFromMemberships ?? null;
    const currentOrgIsMasterOrg = currentOrg?.isMasterOrg ?? false;

    return {
      userId,
      superUser: user?.superUser ?? false,
      currentOrgIsMasterOrg,
      orgRoles: Array.from(orgRoles.entries()).map(([orgId, role]) => ({
        orgId,
        role,
      })),
      siteRoles: Array.from(siteRoles.entries()).map(([tenantId, role]) => ({
        tenantId,
        role,
      })),
      // Include full membership details for convenience
      orgMemberships: orgMemberships.map((m) => ({
        orgId: m.orgId,
        orgName: m.org.name,
        role: m.role,
      })),
      siteMemberships: siteMemberships.map((m) => ({
        tenantId: m.tenantId,
        tenantName: m.tenant.name,
        orgId: m.tenant.orgId,
        role: m.role,
      })),
      hasFamilyAccess: computedHasFamilyAccess,
      hasServeAccess: computedHasServeAccess,
    };
  }

  /**
   * Map legacy Role enum to SiteRole enum
   */
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

  private setActiveSiteCookies(
    res: Response,
    payload: { siteId: string | null; orgId: string | null },
  ) {
    const secure = process.env.NODE_ENV === "production";
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure,
      path: "/",
      maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
    };

    res.cookie(ACTIVE_SITE_COOKIE, payload.siteId ?? "", options);
    res.cookie(ACTIVE_ORG_COOKIE, payload.orgId ?? "", options);
  }
}
