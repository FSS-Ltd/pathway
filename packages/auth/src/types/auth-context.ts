import type { RoleSet } from "./roles";

export interface UserIdentity {
  userId: string;
  /** Verified from the internal User record, never from token claims. */
  isSuperUser?: boolean;
  email?: string;
  givenName?: string;
  familyName?: string;
  pictureUrl?: string;
  authProvider?: "auth0" | "clerk";
}

export interface OrgContext {
  /**
   * Internal org identifier (maps to `orgs.id` in Postgres).
   */
  orgId: string;
  slug?: string;
  name?: string;
  planTier?: string;
}

export interface TenantContext {
  /**
   * Primary key for the tenant row. This is what we feed into Prisma filters + Postgres RLS.
   * NOTE: In the admin UI this is surfaced as “Site” (Site == Tenant for RLS).
   */
  tenantId: string;
  orgId: string;
  slug?: string;
  timezone?: string;
  externalId?: string; // Allows MIS integrations to sync by remote ID later.
}

/** Raw SiteRole from schema (SITE_ADMIN | STAFF | VIEWER) for the current tenant. */
export type SiteRoleName = "SITE_ADMIN" | "STAFF" | "VIEWER";

export interface AuthContext {
  user: UserIdentity;
  org: OrgContext;
  tenant: TenantContext;
  roles: RoleSet;
  permissions: string[];
  rawClaims: Record<string, unknown>;
  /** Raw site role for current tenant; used to distinguish VIEWER (read-only) from STAFF. */
  siteRole?: SiteRoleName | null;
  issuedAt?: number;
  expiresAt?: number;
}

