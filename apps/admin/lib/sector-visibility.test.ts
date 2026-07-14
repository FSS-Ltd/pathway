/**
 * Unit tests for sector-visibility.ts.
 * Run with: node --import tsx apps/admin/lib/sector-visibility.test.ts
 */

import { isFeatureVisibleForSector } from "./sector-visibility";

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

  console.log("isFeatureVisibleForSector");
  assert(
    isFeatureVisibleForSector("CHURCH", "placeholder"),
    "visible for CHURCH until real per-sector rules are defined",
  );
  assert(
    isFeatureVisibleForSector("CLUB", "placeholder"),
    "visible for CLUB until real per-sector rules are defined",
  );
  assert(
    isFeatureVisibleForSector("SCHOOL", "placeholder"),
    "visible for SCHOOL until real per-sector rules are defined",
  );
  assert(
    isFeatureVisibleForSector("CHARITY", "placeholder"),
    "visible for CHARITY until real per-sector rules are defined",
  );
  assert(
    isFeatureVisibleForSector(null, "placeholder"),
    "defaults to visible when the org has no sector set",
  );
  assert(
    isFeatureVisibleForSector(undefined, "placeholder"),
    "defaults to visible when sector is undefined",
  );

  console.log("");
  console.log(`Result: ${passed} passed, ${failed} failed`);
  return failed === 0;
}

if (typeof process !== "undefined" && process.argv[1]?.includes("sector-visibility.test")) {
  const ok = runTests();
  process.exit(ok ? 0 : 1);
}

export { runTests };
