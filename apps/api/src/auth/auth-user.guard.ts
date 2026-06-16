import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { parseAuthTokenFromRequest } from "./auth-token.util";
import { prisma } from "@pathway/db";
import type { Request, Response } from "express";
import { AuthIdentityService } from "./auth-identity.service";
import { safeErrorDiagnostic } from "../common/logging/safe-diagnostics";

interface AuthenticatedRequest extends Request {
  authUserId?: string;
  authEmail?: string;
  authDisplayName?: string;
  [key: string]: unknown;
}

const userInclude = {
  user: {
    include: {
      siteMemberships: {
        include: {
          tenant: {
            include: { org: true },
          },
        },
      },
      orgMemberships: { include: { org: true } },
      orgRoles: { include: { org: true } },
      roles: { include: { tenant: { include: { org: true } } } }, // Legacy UserTenantRole
    },
  },
} as const;

const ACTIVE_SITE_COOKIE = "pw_active_site_id";
const ACTIVE_ORG_COOKIE = "pw_active_org_id";

/**
 * Guard that:
 * 1. Authenticates user via Auth0 JWT (looks up UserIdentity)
 * 2. If identity missing, creates user/identity just-in-time from JWT claims
 * 3. Resolves active tenant from cookie or User.lastActiveTenantId
 * 4. Sets up full PathwayRequestContext with tenant/org for RLS
 */
@Injectable()
export class AuthUserGuard implements CanActivate {
  private readonly logger = new Logger(AuthUserGuard.name);

  constructor(
    @Inject(AuthIdentityService)
    private readonly authIdentityService: AuthIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const res = context.switchToHttp().getResponse<Response>();

    const claims = parseAuthTokenFromRequest(req);
    
    // Extract Auth0 subject
    const auth0Sub = claims.sub;
    if (!auth0Sub) {
      throw new UnauthorizedException("Missing subject claim");
    }

    // Look up user by Auth0 identity
    let identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: "auth0",
          providerSubject: auth0Sub,
        },
      },
      include: userInclude,
    });

    // Just-in-time provisioning: if admin identity upsert failed at login, create user/identity from JWT claims
    if (!identity?.user) {
      try {
        await this.authIdentityService.upsertFromAuth0({
          provider: "auth0",
          subject: auth0Sub,
          email: claims.email,
          name: claims.name ?? claims.given_name ?? undefined,
        });
      } catch (err) {
        this.logger.warn({
          message: "Auth user guard JIT upsert failed",
          route: this.describeRoute(req),
          operation: "authIdentity.upsertFromAuth0",
          hasActiveSiteCookie: Boolean(req.cookies?.[ACTIVE_SITE_COOKIE]),
          hasActiveOrgCookie: Boolean(req.cookies?.[ACTIVE_ORG_COOKIE]),
          ...safeErrorDiagnostic(err),
        });
        const detail =
          err instanceof Error ? err.message : "Unknown JIT upsert failure";
        if (process.env.NODE_ENV === "production") {
          throw new UnauthorizedException(
            "User not found for this Auth0 identity",
          );
        }
        throw new UnauthorizedException(
          `User not found for this Auth0 identity (JIT upsert failed: ${detail})`,
        );
      }
      identity = await prisma.userIdentity.findUnique({
        where: {
          provider_providerSubject: {
            provider: "auth0",
            providerSubject: auth0Sub,
          },
        },
        include: userInclude,
      });
    }

    if (!identity?.user) {
      throw new UnauthorizedException("User not found for this Auth0 identity");
    }

    const user = identity.user;

    // Store user info on request for downstream use
    req.authUserId = user.id;
    req.authEmail = user.email ?? identity.email ?? undefined;
    req.authDisplayName = user.displayName ?? user.name ?? undefined;

    // Determine active tenant from cookie or user's lastActiveTenantId
    const cookieTenantId = req.cookies?.pw_active_site_id;
    const activeTenantId = cookieTenantId || user.lastActiveTenantId;

    let tenantId = "";
    let orgId = "";
    let orgSlug = "";

    let siteRole: "SITE_ADMIN" | "STAFF" | "VIEWER" | null = null;

    // If we have an active tenant, validate and populate context
    if (activeTenantId) {
      const membership = user.siteMemberships.find(
        (m) => m.tenantId === activeTenantId,
      );

      if (membership) {
        tenantId = membership.tenantId;
        orgId = membership.tenant.orgId;
        orgSlug = membership.tenant.org.slug;
        siteRole = membership.role;

        // Sync cookie with DB if they differ
        if (!cookieTenantId || cookieTenantId !== activeTenantId) {
          res.cookie("pw_active_site_id", activeTenantId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          });
          res.cookie("pw_active_org_id", orgId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            maxAge: 30 * 24 * 60 * 60 * 1000,
          });
        }
      } else {
        // Org admin may have implicit access via OrgMembership without SiteMembership.
        // Resolve tenant from DB to get orgId and set context.
        const tenant = await prisma.tenant.findUnique({
          where: { id: activeTenantId },
          include: { org: true },
        });
        if (tenant) {
          const hasOrgAccess =
            user.orgMemberships.some(
              (m) => m.orgId === tenant.orgId && m.role === "ORG_ADMIN",
            ) ||
            user.orgRoles.some(
              (r) => r.orgId === tenant.orgId && r.role === "ORG_ADMIN",
            );
          if (hasOrgAccess) {
            tenantId = tenant.id;
            orgId = tenant.orgId;
            orgSlug = tenant.org?.slug ?? "";
            siteRole = "SITE_ADMIN"; // Org admins have admin-level access to sites in their org
          } else {
            // Legacy UserTenantRole: user may have Role (ADMIN, TEACHER, etc.) but no SiteMembership.
            const legacyRole = user.roles?.find(
              (r) => r.tenantId === activeTenantId,
            );
            if (legacyRole) {
              tenantId = tenant.id;
              orgId = tenant.orgId;
              orgSlug = tenant.org?.slug ?? "";
              if (legacyRole.role === "ADMIN") siteRole = "SITE_ADMIN";
              else if (
                legacyRole.role === "COORDINATOR" ||
                legacyRole.role === "TEACHER"
              )
                siteRole = "STAFF";
              else if (legacyRole.role === "PARENT") siteRole = "VIEWER";
            }
          }
        }
      }
    }

    // Fallback 1: if no active tenant (e.g. cookie missing or first request), use first site so org-scoped endpoints (e.g. billing purchase) work
    if (!tenantId && user.siteMemberships.length > 0) {
      const first = user.siteMemberships[0];
      tenantId = first.tenantId;
      orgId = first.tenant.orgId;
      orgSlug = first.tenant.org.slug ?? "";
      if (!siteRole) siteRole = first.role;
    }

    // Fallback 2: if still no org (e.g. user has org role but no site membership), use first org membership
    if (!orgId && user.orgMemberships.length > 0) {
      const first = user.orgMemberships[0];
      orgId = first.orgId;
      orgSlug = first.org?.slug ?? "";
    }
    if (!orgId && user.orgRoles.length > 0) {
      const first = user.orgRoles[0];
      orgId = first.orgId;
      orgSlug = first.org?.slug ?? "";
    }

    // Map new role system to old role system for backwards compatibility
    // OLD system uses enum values like "org:admin", "tenant:admin"
    const orgRoles = new Set<string>();
    const tenantRoles = new Set<string>();

    // Map OrgMembership roles to old UserOrgRole enum values
    user.orgMemberships.forEach((om) => {
      if (orgId && om.orgId !== orgId) return; // Only include roles for current org
      if (om.role === "ORG_ADMIN") orgRoles.add("org:admin"); // Match UserOrgRole.ORG_ADMIN
      if (om.role === "ORG_BILLING") orgRoles.add("org:billing_manager"); // Match UserOrgRole.BILLING_MANAGER
      if (om.role === "ORG_MEMBER") orgRoles.add("org:support"); // Generic member role
    });
    user.orgRoles.forEach((or) => {
      if (orgId && or.orgId !== orgId) return; // Only include roles for current org
      if (or.role === "ORG_ADMIN") orgRoles.add("org:admin");
      if (or.role === "ORG_BILLING") orgRoles.add("org:billing_manager");
      if (or.role === "ORG_MEMBER") orgRoles.add("org:support");
    });

    // Map SiteMembership roles to old UserTenantRole enum values
    user.siteMemberships.forEach((sm) => {
      if (tenantId && sm.tenantId !== tenantId) return; // Only include roles for current site
      if (sm.role === "SITE_ADMIN") tenantRoles.add("tenant:admin"); // Match UserTenantRole.ADMIN
      if (sm.role === "STAFF") tenantRoles.add("tenant:staff"); // Match UserTenantRole.STAFF
      if (sm.role === "VIEWER") tenantRoles.add("tenant:staff"); // VIEWER can also act as STAFF for read access
    });

    // Legacy UserTenantRole (Role enum: ADMIN, COORDINATOR, TEACHER, PARENT)
    user.roles?.forEach((r) => {
      if (tenantId && r.tenantId !== tenantId) return;
      if (r.role === "ADMIN") tenantRoles.add("tenant:admin");
      if (r.role === "COORDINATOR" || r.role === "TEACHER")
        tenantRoles.add("tenant:staff");
    });

    // Set up PathwayRequestContext for RLS interceptor and downstream services
    const pathwayContext = {
      user: {
        userId: user.id,
        email: user.email ?? identity.email ?? undefined,
        givenName: user.displayName ?? user.name ?? undefined,
        familyName: undefined,
        pictureUrl: undefined,
        authProvider: "auth0",
      },
      org: {
        orgId: orgId || "",
        orgSlug: orgSlug || undefined,
      },
      tenant: {
        tenantId: tenantId || "",
        orgId: orgId || "",
      },
      roles: { org: Array.from(orgRoles), tenant: Array.from(tenantRoles) },
      permissions: [],
      rawClaims: claims as Record<string, unknown>,
      siteRole,
    };

    (req as Record<string, unknown>).__pathwayContext = pathwayContext;

    return true;
  }

  private describeRoute(req: AuthenticatedRequest): string {
    const method = req.method ?? "UNKNOWN";
    const path =
      typeof req.path === "string"
        ? req.path
        : (req.url?.split("?")[0] ?? "unknown");

    return `${method} ${path}`;
  }
}
