import assert from "node:assert/strict";
import { PLANS } from "@pathway/pricing";
import { ADDON_PRICES, PLAN_PRICES } from "./buy-now-pricing";
import { PLAN_CATALOGUE } from "./plan-info";

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
const currentPlans = [
  ["STARTER_49_MONTHLY", 50, 1, 49],
  ["STARTER_49_YEARLY", 50, 1, 490],
  ["GROWTH_99_MONTHLY", 100, 2, 99],
  ["GROWTH_99_YEARLY", 100, 2, 990],
  ["PROFESSIONAL_149_MONTHLY", 200, 5, 149],
  ["PROFESSIONAL_149_YEARLY", 200, 5, 1490],
] as const;

for (const [code, staffCap, sites, amount] of currentPlans) {
  assert.equal(PLANS[code].av30Included, staffCap);
  assert.equal(PLANS[code].maxSitesIncluded, sites);
  assert.ok(
    PLANS[code].features.includes(
      "Up to " +
        staffCap.toLocaleString("en-GB") +
        " active staff and volunteers",
    ),
  );
  assert.equal(PLANS[code].pricePerMonth ?? PLANS[code].pricePerYear, amount);
  assert.equal(PLAN_CATALOGUE[code].av30Included, staffCap);
  assert.equal(PLAN_CATALOGUE[code].priceInPounds, amount);
  assert.equal(PLAN_PRICES[code].amountMajor, amount);
}

assert.ok(
  "MODULE_LEARNING_MONTHLY" in ADDON_PRICES,
  "admin add-on prices must include the Learning module monthly price",
);
