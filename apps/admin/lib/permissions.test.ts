/**
 * Unit tests for permissions.ts
 * Run with: pnpm exec tsx lib/permissions.test.ts (or add Jest to admin and run test:unit)
 */

import type { AdminRoleInfo } from "./access";
import { canAccessRoute, canPerform } from "./permissions";

const staffRole: AdminRoleInfo = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: true,
  isSafeguardingStaff: false,
  isSuperUser: false,
};

const siteAdminRole: AdminRoleInfo = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: true,
  isStaff: true,
  isSafeguardingStaff: false,
  isSuperUser: false,
};

const orgAdminRole: AdminRoleInfo = {
  isOrgAdmin: true,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: true,
  isSafeguardingStaff: false,
  isSuperUser: false,
};

const safeguardingLeadRole: AdminRoleInfo = {
  isOrgAdmin: false,
  isOrgOwner: false,
  isSiteAdmin: false,
  isStaff: true,
  isSafeguardingStaff: true,
  isSuperUser: false,
};

const superUserRole: AdminRoleInfo = {
  ...staffRole,
  isStaff: false,
  isSuperUser: true,
};

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      passed++;
      console.log(`  ✓ ${msg}`);
    } else {
      failed++;
      console.error(`  ✗ ${msg}`);
    }
  }

  console.log("canAccessRoute");
  assert(canAccessRoute("/", staffRole), "STAFF can access /");
  assert(canAccessRoute("/attendance", staffRole), "STAFF can access /attendance");
  assert(canAccessRoute("/sessions", staffRole), "STAFF can access /sessions");
  assert(canAccessRoute("/staff/profile", staffRole), "STAFF can access /staff/profile");
  assert(!canAccessRoute("/people", staffRole), "STAFF cannot access /people");
  assert(!canAccessRoute("/classes", staffRole), "STAFF cannot access /classes");
  assert(!canAccessRoute("/notices", staffRole), "STAFF cannot access /notices");
  assert(canAccessRoute("/safeguarding/concerns/new", staffRole), "STAFF can access /safeguarding/concerns/new");
  assert(!canAccessRoute("/billing", staffRole), "STAFF cannot access /billing");
  assert(!canAccessRoute("/reports", staffRole), "STAFF cannot access /reports");
  assert(!canAccessRoute("/settings", staffRole), "STAFF cannot access /settings");
  assert(!canAccessRoute("/people/invite", staffRole), "STAFF cannot access /people/invite");
  assert(!canAccessRoute("/safeguarding", staffRole), "STAFF cannot access /safeguarding (no safeguarding role)");

  assert(canAccessRoute("/billing", orgAdminRole), "ORG_ADMIN can access /billing");
  assert(canAccessRoute("/reports", orgAdminRole), "ORG_ADMIN can access /reports");
  assert(canAccessRoute("/settings", siteAdminRole), "SITE_ADMIN can access /settings");
  assert(canAccessRoute("/people", siteAdminRole), "SITE_ADMIN can access /people");
  assert(canAccessRoute("/classes", siteAdminRole), "SITE_ADMIN can access /classes");
  assert(canAccessRoute("/notices", siteAdminRole), "SITE_ADMIN can access /notices");
  assert(canAccessRoute("/safeguarding", safeguardingLeadRole), "SAFEGUARDING_LEAD can access /safeguarding");
  assert(canAccessRoute("/safeguarding", siteAdminRole), "SITE_ADMIN can access /safeguarding");
  assert(canAccessRoute("/safeguarding", orgAdminRole), "ORG_ADMIN can access /safeguarding");
  assert(canAccessRoute("/people", superUserRole), "superuser can access People");
  assert(canAccessRoute("/safeguarding", superUserRole), "superuser can access safeguarding");
  assert(!canAccessRoute("/billing", superUserRole), "superuser flag alone does not grant billing authority");

  const rolesReadPermission = ["platform.access.roles.read"];
  assert(
    canAccessRoute("/settings/roles", orgAdminRole, rolesReadPermission),
    "a user holding platform.access.roles.read can access /settings/roles",
  );
  assert(
    !canAccessRoute("/settings/roles", orgAdminRole, []),
    "ORG_ADMIN by role name alone, with no typed permission, cannot access /settings/roles",
  );
  assert(
    !canAccessRoute("/settings/roles", siteAdminRole, []),
    "SITE_ADMIN by role name alone, with no typed permission, cannot access /settings/roles",
  );
  assert(!canAccessRoute("/settings/roles", staffRole, []), "STAFF cannot access /settings/roles");
  assert(!canAccessRoute("/settings/roles", superUserRole, []), "superuser still needs an effective Roles permission");
  assert(canAccessRoute("/settings/roles", superUserRole, rolesReadPermission), "superuser with effective permission can access Roles");

  console.log("canPerform");
  assert(!canPerform("people:invite", staffRole), "STAFF cannot people:invite");
  assert(!canPerform("people:edit", staffRole), "STAFF cannot people:edit");
  assert(canPerform("people:invite", orgAdminRole), "ORG_ADMIN can people:invite");
  assert(canPerform("people:edit", siteAdminRole), "SITE_ADMIN can people:edit");
  assert(!canPerform("billing:access", staffRole), "STAFF cannot billing:access");
  assert(canPerform("billing:access", orgAdminRole), "ORG_ADMIN can billing:access");
  assert(canPerform("safeguarding:access", safeguardingLeadRole), "SAFEGUARDING_LEAD can safeguarding:access");
  assert(canPerform("safeguarding:access", orgAdminRole), "ORG_ADMIN can safeguarding:access");
  assert(canPerform("safeguarding:create", staffRole), "STAFF can safeguarding:create");
  assert(
    !canPerform("assignments:manage", staffRole, []),
    "STAFF with no typed permission cannot assignments:manage",
  );
  assert(
    canPerform("assignments:manage", orgAdminRole, [
      "platform.access.assignments.manage",
    ]),
    "a user holding platform.access.assignments.manage can assignments:manage",
  );

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("permissions.test")) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
