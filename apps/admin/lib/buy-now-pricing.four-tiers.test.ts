import assert from "node:assert/strict";
import { PLAN_PRICES } from "./buy-now-pricing";

assert.ok(
  "STARTER_49_MONTHLY" in PLAN_PRICES,
  "admin PLAN_PRICES must carry the v2 Starter code (Phase 0 PR 0.6)",
);
assert.ok(
  "GROWTH_99_MONTHLY" in PLAN_PRICES,
  "admin PLAN_PRICES must carry the v2 Growth code (Phase 0 PR 0.6)",
);
assert.ok(
  "PROFESSIONAL_149_MONTHLY" in PLAN_PRICES,
  "admin PLAN_PRICES must carry the new Professional code (Phase 0 PR 0.6)",
);
assert.ok(
  !("STARTER_MONTHLY" in PLAN_PRICES),
  "admin PLAN_PRICES must not default new checkouts to the grandfathered Starter code",
);
assert.ok(
  !("GROWTH_MONTHLY" in PLAN_PRICES),
  "admin PLAN_PRICES must not default new checkouts to the grandfathered Growth code",
);
