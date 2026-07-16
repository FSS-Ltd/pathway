/**
 * Unit tests for date.ts.
 * Run with: node --import tsx apps/admin/lib/date.test.ts
 */

import { toLocalDateKey } from "./date";

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

  console.log("toLocalDateKey");
  assert(
    toLocalDateKey(new Date(2026, 6, 20)) === "2026-07-20",
    "formats a local date as YYYY-MM-DD",
  );
  assert(
    toLocalDateKey(new Date(2026, 0, 5)) === "2026-01-05",
    "pads single-digit month and day",
  );
  assert(
    toLocalDateKey(new Date(2026, 11, 31, 23, 59, 59, 999)) === "2026-12-31",
    "uses local calendar getters, not a UTC round-trip via toISOString()",
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

runTests();
