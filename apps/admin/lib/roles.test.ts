import { toLocalDateKey } from "./date";
import {
  formatAssignmentWindow,
  formatAuditTimestamp,
  groupPermissionsByPrefix,
  parseCodedError,
  sensitivityBadgeVariant,
} from "./roles";

function runTests() {
  let passed = 0;
  let failed = 0;

  function assertEqual(actual: unknown, expected: unknown, message: string) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      passed++;
    } else {
      failed++;
      console.error(
        `${message}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`,
      );
    }
  }

  assertEqual(
    groupPermissionsByPrefix([
      "ace.pace.read",
      "platform.access.roles.manage",
      "ace.behaviour.read",
    ]),
    [
      { prefix: "ace", keys: ["ace.behaviour.read", "ace.pace.read"] },
      { prefix: "platform", keys: ["platform.access.roles.manage"] },
    ],
    "groups permission keys by prefix",
  );
  assertEqual(groupPermissionsByPrefix([]), [], "handles no permissions");
  assertEqual(sensitivityBadgeVariant("standard"), "default", "standard badge");
  assertEqual(
    sensitivityBadgeVariant("sensitive"),
    "warning",
    "sensitive badge",
  );
  assertEqual(
    sensitivityBadgeVariant("protected"),
    "danger",
    "protected badge",
  );
  assertEqual(
    parseCodedError(
      new Error("ROLE_NOT_ASSIGNABLE:The selected role cannot be assigned."),
    ),
    {
      code: "ROLE_NOT_ASSIGNABLE",
      message: "The selected role cannot be assigned.",
    },
    "parses API errors",
  );
  assertEqual(
    parseCodedError("network error"),
    { code: null, message: "network error" },
    "handles uncoded errors",
  );

  const starts = "2026-07-30T09:00:00.000Z";
  const expires = "2026-08-30T09:00:00.000Z";
  assertEqual(
    formatAssignmentWindow(starts, null),
    `Since ${toLocalDateKey(new Date(starts))}`,
    "formats an open assignment window",
  );
  assertEqual(
    formatAssignmentWindow(starts, expires),
    `${toLocalDateKey(new Date(starts))} – ${toLocalDateKey(new Date(expires))}`,
    "formats a bounded assignment window",
  );

  const auditIso = "2026-07-30T14:05:00.000Z";
  const auditDate = new Date(auditIso);
  const hours = String(auditDate.getHours()).padStart(2, "0");
  const minutes = String(auditDate.getMinutes()).padStart(2, "0");
  assertEqual(
    formatAuditTimestamp(auditIso),
    `${toLocalDateKey(auditDate)} ${hours}:${minutes}`,
    "formats the audit timestamp",
  );

  console.log(`roles.test: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("roles.test")) {
  process.exit(runTests() ? 0 : 1);
}

export { runTests };
