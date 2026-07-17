import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");

assert.ok(
  source.includes("STARTER_49_MONTHLY"),
  "admin buy-now page must default the Starter tier to the v2 plan code (Phase 0 PR 0.6)",
);
assert.ok(
  source.includes("GROWTH_99_MONTHLY"),
  "admin buy-now page must default the Growth tier to the v2 plan code (Phase 0 PR 0.6)",
);
assert.ok(
  source.includes("PROFESSIONAL_149_MONTHLY"),
  "admin buy-now page must offer the Professional tier (Phase 0 PR 0.6)",
);
assert.ok(
  !source.includes('"STARTER_MONTHLY"'),
  "admin buy-now page must not default new checkouts to the grandfathered Starter code",
);
assert.ok(
  !source.includes('"GROWTH_MONTHLY"'),
  "admin buy-now page must not default new checkouts to the grandfathered Growth code",
);
