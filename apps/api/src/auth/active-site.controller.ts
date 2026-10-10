import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { prisma, OrgRole, SiteRole } from "@pathway/db";
import { AuthUserGuard } from "./auth-user.guard";
import { UserRolesService } from "./user-roles.service";
import { listStudentActiveSites } from "./student-active-sites";

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
  constructor(
    @Inject(UserRolesService)
    private readonly userRolesService: UserRolesService,
  ) {}

  @UseGuards(AuthUserGuard)
  @Get()
  async getActiveSite(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
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

    const selectedSite = sites.find((site) => site.id === activeSiteId);
    this.setActiveSiteCookies(res, {
      siteId: selectedSite?.id ?? null,
      orgId: selectedSite?.orgId ?? null,
    });
    return { activeSiteId: selectedSite?.id ?? null, sites };
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

    const guardianRelationships =
      await prisma.guardianChildRelationship.findMany({
        where: {
          guardianIdentity: { userId, user: { isActive: true } },
          legalAccess: "FULL",
          startsAt: { lte: new Date() },
          endedAt: null,
          revokedAt: null,
          child: { isGuest: false },
          tenant: { org: { parentPortalEnabled: true } },
        },
        select: { tenant: { include: { org: true } } },
      });

    const studentSites = await listStudentActiveSites(userId);

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
      ...guardianRelationships.map<SiteSummary>(({ tenant }) => ({
        id: tenant.id,
        name: tenant.name,
        orgId: tenant.orgId,
        orgName: tenant.org.name,
        orgSlug: tenant.org.slug,
        role: null,
        timezone: tenant.timezone ?? null,
      })),
      ...studentSites.map<SiteSummary>((site) => ({
        id: site.id,
        name: site.name,
        orgId: site.orgId,
        orgName: site.org.name,
        orgSlug: site.org.slug,
        role: null,
        timezone: site.timezone ?? null,
      })),
    ];

    // De-dupe by tenantId
    const seen = new Map<string, SiteSummary>();
    combined.forEach((site) => {
      if (!seen.has(site.id)) {
        seen.set(site.id, site);
      }
    });

    return Array.from(seen.values()).sort(
      (a, b) =>
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

    return this.userRolesService.getUserRoles(userId, {
      activeOrgId: req.cookies?.[ACTIVE_ORG_COOKIE],
      activeSiteId: req.cookies?.[ACTIVE_SITE_COOKIE],
      route: "GET /auth/active-site/roles",
    });
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
