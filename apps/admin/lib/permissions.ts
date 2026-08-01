/**
 * Central permission gates for the admin app.
 * Single place for route and action gating; uses role from access.ts.
 */

import type { AdminRoleInfo } from "./access";
import {
  canAccessAdminSection,
  canAccessBilling,
  canAccessSafeguardingAdmin,
  hasPermission,
  isSiteAdminOrHigher,
} from "./access";

/** Paths gated on platform.access.roles.read (Roles & Access), narrower than admin-only. */
const ROLES_ADMIN_PREFIXES = ["/settings/roles"];

/** Paths restricted to ORG_ADMIN or SITE_ADMIN (admin-only). */
const ADMIN_ONLY_PATHS = [
  "/settings",
  "/reports",
  "/people/invite",
  "/classes/new",
  "/sessions/new",
  "/sessions/bulk-new",
];
const ADMIN_ONLY_PREFIXES = ["/settings", "/reports", "/people/invite"];

/** Paths restricted to ORG_ADMIN only (billing). */
const BILLING_PREFIXES = ["/billing"];

/** Paths restricted to SITE_ADMIN or ORG_ADMIN (People, Classes, Announcements). */
const SITE_ADMIN_PATHS = ["/people", "/classes", "/notices"];
const SITE_ADMIN_PREFIXES = ["/people", "/classes", "/notices"];

/** Create concern: any staff can access. */
const CREATE_CONCERN_PATH = "/safeguarding/concerns/new";

/**
 * Check if the user can access the given pathname.
 * Staff (no admin): /, /staff/profile, /children, /parents, /lessons, /sessions, /my-schedule, /attendance, /safeguarding/concerns/new.
 * Site/Org admin: + /people, /classes, /notices, /safeguarding (view).
 * Org admin only: /billing.
 */
export function canAccessRoute(
  pathname: string,
  role: AdminRoleInfo,
  permissions?: string[] | null,
): boolean {
  const path = pathname.replace(/\/$/, "") || "/";

  if (BILLING_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))) {
    return canAccessBilling(role);
  }
  if (path === CREATE_CONCERN_PATH) {
    return true; // Any authenticated staff can create concerns
  }
  if (
    ROLES_ADMIN_PREFIXES.some((p) => path === p || path.startsWith(p + "/"))
  ) {
    return hasPermission(permissions ?? null, "platform.access.roles.read");
  }
  if (path === "/safeguarding" || path.startsWith("/safeguarding/")) {
    return canAccessSafeguardingAdmin(role);
  }
  if (
    ADMIN_ONLY_PATHS.some((p) => path === p) ||
    ADMIN_ONLY_PREFIXES.some((p) => path.startsWith(p + "/"))
  ) {
    return canAccessAdminSection(role);
  }
  if (
    SITE_ADMIN_PATHS.some((p) => path === p) ||
    SITE_ADMIN_PREFIXES.some((p) => path.startsWith(p + "/"))
  ) {
    if (path === "/people/invite" || path.startsWith("/people/invite/")) {
      return canAccessAdminSection(role);
    }
    return isSiteAdminOrHigher(role);
  }

  return true;
}

export type AdminAction =
  | "people:invite"
  | "people:edit"
  | "sessions:create"
  | "sessions:edit"
  | "sessions:bulk-create"
  | "classes:create"
  | "classes:edit"
  | "settings:access"
  | "settings:edit-org"
  | "settings:edit-site"
  | "reports:access"
  | "billing:access"
  | "safeguarding:access"
  | "safeguarding:create"
  | "roles:manage"
  | "assignments:manage";

/**
 * Check if the user can perform the given action.
 * Use for hiding or disabling buttons (invite, edit, create, etc.).
 */
export function canPerform(
  action: AdminAction,
  role: AdminRoleInfo,
  permissions?: string[] | null,
): boolean {
  switch (action) {
    case "people:invite":
    case "people:edit":
      return canAccessAdminSection(role);
    case "sessions:create":
    case "sessions:edit":
    case "sessions:bulk-create":
    case "classes:create":
    case "classes:edit":
    case "settings:access":
    case "reports:access":
      return canAccessAdminSection(role);
    case "settings:edit-org":
      return canAccessBilling(role);
    case "settings:edit-site":
      return canAccessAdminSection(role);
    case "billing:access":
      return canAccessBilling(role);
    case "safeguarding:access":
      return canAccessSafeguardingAdmin(role);
    case "safeguarding:create":
      return true; // Any staff can create concerns
    case "roles:manage":
      return hasPermission(permissions ?? null, "platform.access.roles.manage");
    case "assignments:manage":
      return hasPermission(
        permissions ?? null,
        "platform.access.assignments.manage",
      );
    default:
      return false;
  }
}
