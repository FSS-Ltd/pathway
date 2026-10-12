import assert from "node:assert/strict";
import {
  calculateInstitutionalQuote,
  INSTITUTIONAL_CHILD_PRICE_CODES,
  INSTITUTIONAL_PLANS,
  INSTITUTIONAL_PRICING_VERSION,
  InstitutionalPricingInputError,
  type InstitutionalPlanCode,
  type InstitutionalQuoteInput,
} from "../institutional-pricing";

const planCodes = [
  "INSTITUTIONAL_STARTER_MONTHLY",
  "INSTITUTIONAL_GROWTH_MONTHLY",
  "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
] as const satisfies readonly InstitutionalPlanCode[];

function referenceSubtotal(
  basePence: number,
  includedChildren: number,
  enrolledChildren: number,
): number {
  let subtotal = basePence;
  for (let childNumber = 1; childNumber <= enrolledChildren; childNumber += 1) {
    if (childNumber <= includedChildren) continue;
    subtotal += childNumber <= 100 ? 100 : 75;
  }
  return subtotal;
}

let checkedCases = 0;
for (const planCode of planCodes) {
  const plan = INSTITUTIONAL_PLANS[planCode];
  assert.equal(plan.checkoutEnabled, false);
  assert.equal(plan.billingMetric, "ENROLLED_CHILDREN");
  assert.equal(plan.pricingVersion, INSTITUTIONAL_PRICING_VERSION);
  for (
    let enrolledChildren = 0;
    enrolledChildren <= 250;
    enrolledChildren += 1
  ) {
    const result = calculateInstitutionalQuote({
      planCode,
      enrolledChildren,
      pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    });
    assert.equal(result.kind, "priced");
    if (result.kind !== "priced") continue;

    assert.equal(
      result.subtotalPence,
      referenceSubtotal(
        plan.basePence,
        plan.includedChildren,
        enrolledChildren,
      ),
    );
    assert.equal(result.enrolledChildren, enrolledChildren);
    assert.equal(result.includedChildren, plan.includedChildren);
    assert.deepEqual(result.lines[0], {
      component: "BASE",
      quantity: 1,
      unitAmountPence: plan.basePence,
      subtotalPence: plan.basePence,
    });
    assert.equal(
      result.lines.reduce((sum, line) => sum + line.subtotalPence, 0),
      result.subtotalPence,
    );
    assert.ok(result.lines.every((line) => line.quantity > 0));
    assert.equal(
      result.lines.find((line) => line.component === "CHILDREN_UP_TO_100")
        ?.quantity ?? 0,
      Math.max(0, Math.min(enrolledChildren, 100) - plan.includedChildren),
    );
    assert.equal(
      result.lines.find((line) => line.component === "CHILDREN_101_TO_250")
        ?.quantity ?? 0,
      Math.max(0, enrolledChildren - 100),
    );
    checkedCases += 1;
  }
}
assert.equal(checkedCases, 753);
assert.equal(
  new Set([...planCodes, ...Object.values(INSTITUTIONAL_CHILD_PRICE_CODES)])
    .size,
  5,
);

assert.deepEqual(
  planCodes.map((code) => [
    INSTITUTIONAL_PLANS[code].includedChildren,
    INSTITUTIONAL_PLANS[code].includedModuleSlots,
    INSTITUTIONAL_PLANS[code].includedSites,
  ]),
  [
    [25, 0, 1],
    [75, 3, 2],
    [100, 6, 5],
  ],
);

for (const planCode of planCodes) {
  const aboveLimit = calculateInstitutionalQuote({
    planCode,
    enrolledChildren: 251,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
  });
  assert.deepEqual(aboveLimit, {
    kind: "contact_sales",
    planCode,
    enrolledChildren: 251,
    pricingVersion: INSTITUTIONAL_PRICING_VERSION,
    reason: "OVER_250_CHILDREN",
  });
}

const validInput: InstitutionalQuoteInput = {
  planCode: planCodes[0],
  enrolledChildren: 25,
  pricingVersion: INSTITUTIONAL_PRICING_VERSION,
};
for (const count of [
  -1,
  1.5,
  Number.NaN,
  Number.POSITIVE_INFINITY,
  Number.MAX_SAFE_INTEGER + 1,
  "25",
  null,
  undefined,
]) {
  // Runtime boundary validation must reject values outside the TypeScript contract.
  assert.throws(
    () =>
      calculateInstitutionalQuote({
        ...validInput,
        enrolledChildren: count as number,
      }),
    (error: unknown) =>
      error instanceof InstitutionalPricingInputError &&
      error.code === "INVALID_COUNT",
  );
}
assert.throws(
  () =>
    calculateInstitutionalQuote({
      ...validInput,
      planCode: "NOT_A_PLAN" as InstitutionalPlanCode,
    }),
  (error: unknown) =>
    error instanceof InstitutionalPricingInputError &&
    error.code === "INVALID_PLAN",
);
assert.throws(
  () =>
    calculateInstitutionalQuote({
      ...validInput,
      pricingVersion: "UNKNOWN" as typeof INSTITUTIONAL_PRICING_VERSION,
    }),
  (error: unknown) =>
    error instanceof InstitutionalPricingInputError &&
    error.code === "INVALID_PRICING_VERSION",
);

console.log(`institutional pricing: ${checkedCases} plan/count cases passed`);
