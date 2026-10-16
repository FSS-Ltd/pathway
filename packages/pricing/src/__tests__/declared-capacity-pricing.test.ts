import assert from "node:assert/strict";
import {
  calculateDeclaredCapacityQuote,
  DeclaredCapacityPricingInputError,
  DECLARED_CAPACITY_PRICING_VERSION,
  type DeclaredCapacityQuoteInput,
} from "../declared-capacity-pricing";
import {
  calculateInstitutionalQuote,
  INSTITUTIONAL_PRICING_VERSION,
} from "../institutional-pricing";

const expectedQuotes = [
  { capacity: 0, tier: "starter", monthlyPence: 7_400 },
  { capacity: 1, tier: "starter", monthlyPence: 7_500 },
  { capacity: 74, tier: "starter", monthlyPence: 14_800 },
  { capacity: 75, tier: "growth", monthlyPence: 14_900 },
  { capacity: 149, tier: "growth", monthlyPence: 22_300 },
  { capacity: 150, tier: "professional", monthlyPence: 22_400 },
  { capacity: 250, tier: "professional", monthlyPence: 32_400 },
  { capacity: 251, tier: "enterprise", monthlyPence: null },
] as const;

for (const expected of expectedQuotes) {
  for (const interval of ["month", "year"] as const) {
    const quote = calculateDeclaredCapacityQuote({
      declaredCapacity: expected.capacity,
      interval,
    });

    assert.equal(quote.pricingVersion, DECLARED_CAPACITY_PRICING_VERSION);
    assert.equal(quote.tier, expected.tier);
    assert.equal(quote.declaredCapacity, expected.capacity);

    if (expected.tier === "enterprise") {
      assert.deepEqual(quote, {
        kind: "contact_sales",
        pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
        tier: "enterprise",
        declaredCapacity: expected.capacity,
        interval,
        siteAllowance: null,
        contactPath: "/demo?plan=enterprise",
      });
      continue;
    }

    assert.equal(quote.kind, "priced");
    if (quote.kind !== "priced") continue;

    const monthlyPence = expected.monthlyPence;
    assert.ok(monthlyPence !== null);
    const expectedTotalPence =
      interval === "month" ? monthlyPence : monthlyPence * 10;
    const expectedBasePence = interval === "month" ? 7_400 : 74_000;
    const expectedCapacityUnitPence = interval === "month" ? 100 : 1_000;

    assert.equal(quote.totalPence, expectedTotalPence);
    assert.deepEqual(quote.lines, [
      {
        component: "BASE",
        priceCode:
          interval === "month"
            ? "DECLARED_CAPACITY_BASE_MONTHLY"
            : "DECLARED_CAPACITY_BASE_YEARLY",
        quantity: 1,
        unitAmountPence: expectedBasePence,
        subtotalPence: expectedBasePence,
      },
      {
        component: "DECLARED_CAPACITY",
        priceCode:
          interval === "month"
            ? "DECLARED_CAPACITY_CHILD_MONTHLY"
            : "DECLARED_CAPACITY_CHILD_YEARLY",
        quantity: expected.capacity,
        unitAmountPence: expectedCapacityUnitPence,
        subtotalPence: expected.capacity * expectedCapacityUnitPence,
      },
    ]);
    assert.equal(
      quote.siteAllowance,
      expected.tier === "starter" ? 1 : expected.tier === "growth" ? 2 : 5,
    );
    assert.equal(
      quote.trialModuleSlots,
      expected.tier === "starter" ? 2 : expected.tier === "growth" ? 3 : 4,
    );
    assert.deepEqual(quote.includedPaidModules, []);
  }
}

const validInput: DeclaredCapacityQuoteInput = {
  declaredCapacity: 75,
  interval: "month",
};

for (const declaredCapacity of [
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
  "75",
  null,
  undefined,
]) {
  assert.throws(
    () =>
      calculateDeclaredCapacityQuote({
        ...validInput,
        // Exercise the runtime boundary with values outside the TS contract.
        declaredCapacity: declaredCapacity as unknown as number,
      }),
    (error: unknown) =>
      error instanceof DeclaredCapacityPricingInputError &&
      error.code === "INVALID_COUNT",
  );
}

assert.throws(
  () =>
    calculateDeclaredCapacityQuote({
      ...validInput,
      interval:
        "quarterly" as unknown as DeclaredCapacityQuoteInput["interval"],
    }),
  (error: unknown) =>
    error instanceof DeclaredCapacityPricingInputError &&
    error.code === "INVALID_INTERVAL",
);

assert.equal(INSTITUTIONAL_PRICING_VERSION, "ENROLLED_CHILDREN_V1");
const historicalQuote = calculateInstitutionalQuote({
  planCode: "INSTITUTIONAL_STARTER_MONTHLY",
  enrolledChildren: 25,
  pricingVersion: INSTITUTIONAL_PRICING_VERSION,
});
assert.equal(historicalQuote.kind, "priced");
if (historicalQuote.kind === "priced") {
  assert.equal(historicalQuote.subtotalPence, 4_900);
}

console.log(
  "declared-capacity pricing: monthly, annual, boundaries, validation, and legacy isolation passed",
);
