/**
 * Unit tests for roles.ts
 * Run with: pnpm exec tsx lib/roles.test.ts (or add Jest to admin and run test:unit)
 */

import { toLocalDateKey } from "./date";
import {
  computePermissionCheckState,
  formatAssignmentWindow,
  formatAuditTimestamp,
  groupPermissionsByPrefix,
  parseCodedError,
  roleScopeAcceptsPermissionScope,
  sensitivityBadgeVariant,
} from "./roles";

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

  function assertEqual(actual: unknown, expected: unknown, msg: string) {
    assert(
      JSON.stringify(actual) === JSON.stringify(expected),
      `${msg} (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`,
    );
  }

  console.log("groupPermissionsByPrefix");
  assertEqual(
    groupPermissionsByPrefix([
      "ace.pace.read",
      "platform.access.roles.manage",
      "ace.behaviour.read",
      "platform.access.users.read",
    ]),
    [
      { prefix: "ace", keys: ["ace.behaviour.read", "ace.pace.read"] },
      {
        prefix: "platform",
        keys: ["platform.access.roles.manage", "platform.access.users.read"],
      },
    ],
    "groups by first dotted segment, sorted",
  );
  assertEqual(groupPermissionsByPrefix([]), [], "empty input yields no groups");
  assertEqual(
    groupPermissionsByPrefix(["standalone"]),
    [{ prefix: "standalone", keys: ["standalone"] }],
    "a key with no dot is its own group",
  );

  console.log("sensitivityBadgeVariant");
  assertEqual(sensitivityBadgeVariant("standard"), "default", "standard -> default");
  assertEqual(sensitivityBadgeVariant("sensitive"), "warning", "sensitive -> warning");
  assertEqual(sensitivityBadgeVariant("protected"), "danger", "protected -> danger");

  console.log("roleScopeAcceptsPermissionScope");
  assert(
    roleScopeAcceptsPermissionScope("organisation", "organisation"),
    "organisation role accepts organisation permission",
  );
  assert(
    roleScopeAcceptsPermissionScope("organisation", "site"),
    "organisation role accepts site permission",
  );
  assert(
    roleScopeAcceptsPermissionScope("organisation", "relationship"),
    "organisation role accepts relationship permission",
  );
  assert(
    roleScopeAcceptsPermissionScope("organisation", "assignment"),
    "organisation role accepts assignment permission",
  );
  assert(
    roleScopeAcceptsPermissionScope("site", "site"),
    "site role accepts site permission",
  );
  assert(
    !roleScopeAcceptsPermissionScope("site", "organisation"),
    "site role does not widen to organisation permission",
  );

  console.log("computePermissionCheckState");
  assertEqual(
    computePermissionCheckState(false, false, true),
    { checked: false, disabled: true, reason: "This permission cannot be delegated to a role." },
    "a non-delegable key is always unchecked and disabled",
  );
  assertEqual(
    computePermissionCheckState(true, false, true),
    { checked: true, disabled: true, reason: "You cannot delegate this permission." },
    "an actor-restricted key stays checked (if previously granted) but disabled",
  );
  assertEqual(
    computePermissionCheckState(true, true, true),
    { checked: true, disabled: false },
    "a delegable, actor-available, selected key is enabled and checked",
  );
  assertEqual(
    computePermissionCheckState(true, true, false),
    { checked: false, disabled: false },
    "a delegable, actor-available, unselected key is enabled and unchecked",
  );

  console.log("parseCodedError");
  assertEqual(
    parseCodedError(new Error("ROLE_VERSION_CONFLICT:The role was changed by another request.")),
    { code: "ROLE_VERSION_CONFLICT", message: "The role was changed by another request." },
    "splits a coded error into code and message",
  );
  assertEqual(
    parseCodedError(new Error("Failed to fetch roles: 500 boom")),
    { code: null, message: "Failed to fetch roles: 500 boom" },
    "falls back to no code for an uncoded error",
  );
  assertEqual(
    parseCodedError("not an Error instance"),
    { code: null, message: "not an Error instance" },
    "handles a non-Error thrown value",
  );

  console.log("formatAssignmentWindow");
  const starts = "2026-07-30T09:00:00.000Z";
  const expires = "2026-08-30T09:00:00.000Z";
  assertEqual(
    formatAssignmentWindow(starts, null),
    `Since ${toLocalDateKey(new Date(starts))}`,
    "an open-ended assignment shows only its start date",
  );
  assertEqual(
    formatAssignmentWindow(starts, expires),
    `${toLocalDateKey(new Date(starts))} – ${toLocalDateKey(new Date(expires))}`,
    "an expiring assignment shows a start–end range",
  );

  console.log("formatAuditTimestamp");
  const auditIso = "2026-07-30T14:05:00.000Z";
  const auditDate = new Date(auditIso);
  const expectedTime = `${String(auditDate.getHours()).padStart(2, "0")}:${String(
    auditDate.getMinutes(),
  ).padStart(2, "0")}`;
  assertEqual(
    formatAuditTimestamp(auditIso),
    `${toLocalDateKey(auditDate)} ${expectedTime}`,
    "formats a local date and zero-padded time",
  );

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("roles.test")) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
