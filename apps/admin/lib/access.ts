/**
 * Admin access control helpers
 * 
 * Defines role-based permissions for the admin app.
 * Queries UserOrgRole, UserTenantRole, OrgMembership, and SiteMembership tables via API.
 */

import type { UserRolesResponse } from "./api-client";

export type AdminRoleInfo = {
  isOrgAdmin: boolean;
  isOrgOwner: boolean;
  isSiteAdmin: boolean;
  isStaff: boolean;
  isSafeguardingStaff: boolean;
  isSuperUser: boolean;
};

/**
 * Extract role information from API response
 * 
 * Queries the database via /auth/active-site/roles endpoint which checks:
 * - UserOrgRole table (org-level roles)
 * - UserTenantRole table (site-level roles)
 * - OrgMembership table (org-level memberships)
 * - SiteMembership table (site-level memberships)
 */
export function getAdminRoleInfoFromApiResponse(
  rolesResponse: UserRolesResponse | null | undefined,
): AdminRoleInfo {
  const noAccessRole: AdminRoleInfo = {
    isOrgAdmin: false,
    isOrgOwner: false,
    isSiteAdmin: false,
    isStaff: false,
    isSafeguardingStaff: false,
    isSuperUser: false,
  };

  if (!rolesResponse) {
    return noAccessRole;
  }

  // Check org roles from both sources
  const orgRoles = new Set<string>();
  rolesResponse.orgRoles.forEach((r) => orgRoles.add(r.role));
  rolesResponse.orgMemberships.forEach((m) => orgRoles.add(m.role));

  // Check site roles from both sources
  const siteRoles = new Set<string>();
  rolesResponse.siteRoles.forEach((r) => siteRoles.add(r.role));
  rolesResponse.siteMemberships.forEach((m) => siteRoles.add(m.role));

  // Determine permissions (org + site roles; SAFEGUARDING_LEAD can be org or site level)
  const isOrgAdmin = orgRoles.has("ORG_ADMIN");
  const isOrgOwner = orgRoles.has("ORG_OWNER"); // Note: ORG_OWNER not in current enum, but checking for future
  const isSiteAdmin = siteRoles.has("SITE_ADMIN");
  const isSafeguardingLead =
    orgRoles.has("SAFEGUARDING_LEAD") || siteRoles.has("SAFEGUARDING_LEAD");
  const isStaff =
    siteRoles.has("STAFF") ||
    siteRoles.has("TEACHER") ||
    siteRoles.has("VIEWER") ||
    (!isOrgAdmin && !isSiteAdmin);

  const isSafeguardingStaff = isSafeguardingLead;
  const isSuperUser = rolesResponse.superUser === true;

  return {
    isOrgAdmin,
    isOrgOwner,
    isSiteAdmin,
    isStaff,
    isSafeguardingStaff,
    isSuperUser,
  };
}

/**
 * Check if user can access admin-only sections
 * (Reports, Settings, People management, etc.)
 */
export function canAccessAdminSection(role: AdminRoleInfo): boolean {
  return role.isOrgAdmin || role.isOrgOwner || role.isSiteAdmin;
}

/**
 * Staff without admin (no SITE_ADMIN, no ORG_ADMIN).
 * Sees Profile instead of People; no Classes, Announcements, or Safeguarding dashboard.
 */
export function isStaffOnly(role: AdminRoleInfo): boolean {
  return role.isStaff && !role.isSiteAdmin && !role.isOrgAdmin && !role.isOrgOwner;
}

/**
 * Site admin or org admin. Can access People, Classes, Announcements, full Safeguarding.
 */
export function isSiteAdminOrHigher(role: AdminRoleInfo): boolean {
  return role.isSiteAdmin || role.isOrgAdmin || role.isOrgOwner;
}

/**
 * Check if user can access billing & subscription management
 * Restricted to org admins and owners only
 */
export function canAccessBilling(role: AdminRoleInfo): boolean {
  return role.isOrgAdmin || role.isOrgOwner;
}

/**
 * Check if user can access safeguarding admin section
 * ORG_ADMIN, SITE_ADMIN, or SAFEGUARDING_LEAD can view the admin safeguarding dashboard.
 */
export function canAccessSafeguardingAdmin(role: AdminRoleInfo): boolean {
  return (
    role.isOrgAdmin ||
    role.isOrgOwner ||
    role.isSiteAdmin ||
    role.isSafeguardingStaff
  );
}

/**
 * Access requirement types for nav items
 */
export type AccessRequirement =
  | "none" // Always visible
  | "admin-only" // Org/site admins only
  | "billing" // Billing access (org admin only)
  | "safeguarding-admin" // Safeguarding admin overview (view concerns)
  | "staff-or-admin" // Any authenticated user
  | "staff-only" // Staff without admin (Profile, Create concern)
  | "site-admin-or-higher" // SITE_ADMIN or ORG_ADMIN (People, Classes, Announcements)
  | "super-user"; // Nexsteps staff only (e.g. blog)

export type AccessContext = {
  /** When true, billing nav and purchase flows are hidden (master/internal org). */
  currentOrgIsMasterOrg?: boolean;
};

export function hasCapability(
  capabilities: string[],
  required: string | undefined,
): boolean {
  if (!required) {
    return true;
  }
  return capabilities.includes(required);
}

/**
 * Check if user meets an access requirement
 */
export function meetsAccessRequirement(
  role: AdminRoleInfo,
  requirement: AccessRequirement | undefined,
  context?: AccessContext,
): boolean {
  if (!requirement || requirement === "none" || requirement === "staff-or-admin") {
    return true;
  }

  switch (requirement) {
    case "admin-only":
      return canAccessAdminSection(role);
    case "billing":
      return canAccessBilling(role);
    case "safeguarding-admin":
      return canAccessSafeguardingAdmin(role);
    case "staff-only":
      return isStaffOnly(role);
    case "site-admin-or-higher":
      return isSiteAdminOrHigher(role);
    case "super-user":
      return role.isSuperUser;
    default:
      return true;
  }
}
