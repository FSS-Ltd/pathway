import { Injectable, UnauthorizedException } from "@nestjs/common";
import { OrgRole, SiteRole, prisma } from "@pathway/db";

type SiteSummary = {
  id: string;
  name: string;
  orgId: string;
  orgName: string | null;
  orgSlug?: string | null;
  role?: SiteRole | null;
};

type ActiveSiteState = {
  activeSiteId: string | null;
  sites: SiteSummary[];
};

const ORG_ADMIN_ROLES = [OrgRole.ORG_ADMIN, OrgRole.ORG_BILLING];

@Injectable()
export class ActiveSiteService {
  async getActiveSiteState(userId: string): Promise<ActiveSiteState> {
    const sites = await this.listSitesForUser(userId);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { lastActiveTenantId: true },
    });

    let activeSiteId = sites.find(
      (site) => site.id === user?.lastActiveTenantId,
    )?.id;

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

  async setActiveSite(userId: string, tenantId: string): Promise<ActiveSiteState> {
    const sites = await this.listSitesForUser(userId);
    const hasAccess = sites.some((site) => site.id === tenantId);

    if (!hasAccess) {
      throw new UnauthorizedException("Site not accessible for this user");
    }

    await prisma.user.update({
      where: { id: userId },
      data: { lastActiveTenantId: tenantId },
    });

    return { activeSiteId: tenantId, sites };
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
      })),
      ...orgTenantIds.map<SiteSummary>((tenant) => ({
        id: tenant.id,
        name: tenant.name,
        orgId: tenant.orgId,
        orgName: tenant.org.name,
        orgSlug: tenant.org.slug,
        role: SiteRole.SITE_ADMIN,
      })),
    ];

    // De-dupe by tenantId preferring direct membership role over org-level view
    const seen = new Map<string, SiteSummary>();
    combined.forEach((site) => {
      if (!seen.has(site.id)) {
        seen.set(site.id, site);
        return;
      }
      const existing = seen.get(site.id)!;
      if (existing.role === SiteRole.SITE_ADMIN) return;
      if (site.role === SiteRole.SITE_ADMIN) {
        seen.set(site.id, site);
      }
    });

    return Array.from(seen.values()).sort((a, b) =>
      (a.orgName ?? "").localeCompare(b.orgName ?? "") ||
      a.name.localeCompare(b.name),
    );
  }
}

