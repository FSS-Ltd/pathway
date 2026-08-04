import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { verifyBearerToken, type VerifiedPrincipal } from "./token-verifier";
import { Prisma, prisma } from "@pathway/db";
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

type UserWithMemberships = Prisma.UserIdentityGetPayload<{
  include: typeof userInclude;
}>["user"];

/**
 * Guard that:
 * 1. Verifies the bearer token's signature, issuer, audience and expiry
 *    (Auth0 or Clerk - see token-verifier.ts), then resolves it to an
 *    internal user via UserIdentity, in priority order:
 *      - existing (provider, subject) link
 *      - externalId asserted on the token -> internal User.id
 *      - verified email match, only when exactly one User matches
 *      - just-in-time creation
 * 2. Resolves active tenant from cookie or User.lastActiveTenantId
 * 3. Sets up full PathwayRequestContext with tenant/org for RLS
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

    const principal = await verifyBearerToken(req.headers.authorization);
    const user = await this.resolveUser(req, principal);

    // Store user info on request for downstream use
    req.authUserId = user.id;
    req.authEmail = user.email ?? principal.email ?? undefined;
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
        email: user.email ?? principal.email ?? undefined,
        givenName: user.displayName ?? user.name ?? undefined,
        familyName: undefined,
        pictureUrl: undefined,
        authProvider: principal.provider,
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
      rawClaims: principal as unknown as Record<string, unknown>,
      siteRole,
    };

    (req as Record<string, unknown>).__pathwayContext = pathwayContext;

    return true;
  }

  /**
   * Resolves a verified principal to an internal user, provisioning one
   * just-in-time if no identity is linked yet. See AuthIdentityService for
   * the full resolution order (existing link -> externalId -> verified
   * email -> new user).
   */
  private async resolveUser(
    req: AuthenticatedRequest,
    principal: VerifiedPrincipal,
  ): Promise<UserWithMemberships> {
    const identity = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: principal.provider,
          providerSubject: principal.sub,
        },
      },
      include: userInclude,
    });

    if (identity?.user) {
      return identity.user;
    }

    try {
      await this.authIdentityService.upsertFromProvider({
        provider: principal.provider,
        subject: principal.sub,
        email: principal.email,
        emailVerified: principal.emailVerified,
        name: principal.name,
        externalId: principal.externalId,
      });
    } catch (err) {
      this.logger.warn({
        message: "Auth user guard JIT upsert failed",
        route: this.describeRoute(req),
        operation: "authIdentity.upsertFromProvider",
        hasActiveSiteCookie: Boolean(req.cookies?.[ACTIVE_SITE_COOKIE]),
        hasActiveOrgCookie: Boolean(req.cookies?.[ACTIVE_ORG_COOKIE]),
        ...safeErrorDiagnostic(err),
      });
      throw new UnauthorizedException("User not found for this identity");
    }

    const provisioned = await prisma.userIdentity.findUnique({
      where: {
        provider_providerSubject: {
          provider: principal.provider,
          providerSubject: principal.sub,
        },
      },
      include: userInclude,
    });

    if (!provisioned?.user) {
      throw new UnauthorizedException("User not found for this identity");
    }

    return provisioned.user;
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
