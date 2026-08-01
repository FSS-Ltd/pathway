/**
 * Unit tests for access.ts.
 * Run with: node --import tsx apps/admin/lib/access.test.ts
 */

import {
  getAdminRoleInfoFromApiResponse,
  hasCapability,
  hasPermission,
  meetsAccessRequirement,
} from "./access";

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

  console.log("getAdminRoleInfoFromApiResponse");
  const unknownRole = getAdminRoleInfoFromApiResponse(null);
  assert(!unknownRole.isStaff, "missing role payload does not grant staff access");
  assert(!unknownRole.isOrgAdmin, "missing role payload does not grant org admin");
  assert(!unknownRole.isSiteAdmin, "missing role payload does not grant site admin");
  assert(!unknownRole.isSuperUser, "missing role payload does not grant superuser");

  const superUserRole = getAdminRoleInfoFromApiResponse({
    userId: "user-super",
    superUser: true,
    currentOrgIsMasterOrg: true,
    orgRoles: [{ orgId: "org-1", role: "ORG_ADMIN" }],
    siteRoles: [{ tenantId: "tenant-1", role: "SITE_ADMIN" }],
    orgMemberships: [
      { orgId: "org-1", orgName: "Victorious Kids", role: "ORG_ADMIN" },
    ],
    siteMemberships: [
      {
        tenantId: "tenant-1",
        tenantName: "Victorious Kids",
        orgId: "org-1",
        role: "SITE_ADMIN",
      },
    ],
  });

  assert(superUserRole.isSuperUser, "superuser payload grants superuser access");
  assert(superUserRole.isOrgAdmin, "org admin membership grants org admin");
  assert(superUserRole.isSiteAdmin, "site admin membership grants site admin");

  console.log("hasCapability");
  assert(
    hasCapability(["finance.invoices"], "finance.invoices"),
    "required capability is visible when granted",
  );
  assert(
    !hasCapability([], "finance.invoices"),
    "required capability is hidden when not granted",
  );
  assert(
    hasCapability([], undefined),
    "items without a capability requirement stay visible",
  );

  console.log("hasPermission");
  assert(
    hasPermission(["platform.access.roles.read"], "platform.access.roles.read"),
    "required permission is visible when the actor holds it",
  );
  assert(
    !hasPermission([], "platform.access.roles.read"),
    "required permission is hidden when the actor does not hold it",
  );
  assert(
    hasPermission([], undefined),
    "items without a permission requirement stay visible",
  );
  assert(
    hasPermission(null, "platform.access.roles.read"),
    "not-yet-loaded permissions (null) keep nav advisory rather than hiding it",
  );

  console.log("meetsAccessRequirement");
  assert(
    !meetsAccessRequirement(superUserRole, "billing", {
      currentOrgIsMasterOrg: true,
    }),
    "master/internal orgs hide billing even from org admins",
  );

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("access.test")) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
