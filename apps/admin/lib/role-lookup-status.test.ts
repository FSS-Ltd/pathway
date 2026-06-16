/**
 * Unit tests for role-lookup-status.ts.
 * Run with: pnpm exec tsx apps/admin/lib/role-lookup-status.test.ts
 */

import { getRoleLookupFailureStatus } from "./role-lookup-status";

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

  console.log("getRoleLookupFailureStatus");

  const fallbackStatus = getRoleLookupFailureStatus(
    new Error("Failed to fetch user roles: 500"),
    true,
  );
  assert(fallbackStatus.error === null, "session fallback suppresses hard error");
  assert(
    fallbackStatus.warning ===
      "Failed to fetch user roles: 500. Using saved session roles.",
    "session fallback returns warning copy",
  );

  const hardFailureStatus = getRoleLookupFailureStatus(
    new Error("Failed to fetch user roles: 500"),
    false,
  );
  assert(
    hardFailureStatus.error === "Failed to fetch user roles: 500",
    "missing session roles returns hard error",
  );
  assert(hardFailureStatus.warning === null, "hard error has no fallback warning");

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (
  typeof process !== "undefined" &&
  process.argv[1]?.includes("role-lookup-status.test")
) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
