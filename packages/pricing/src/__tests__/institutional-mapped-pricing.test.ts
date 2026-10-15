import assert from "node:assert/strict";
import {
  calculateMappedInstitutionalQuote,
  InstitutionalMappedPriceError,
  type InstitutionalResolvedPrices,
} from "../institutional-mapped-pricing";

const prices: InstitutionalResolvedPrices = {
  STARTER_49_MONTHLY: { priceId: "price_monthbase", unitAmountPence: 5700 },
  STARTER_49_YEARLY: { priceId: "price_yearbase", unitAmountPence: 51000 },
  GROWTH_99_MONTHLY: { priceId: "price_growthmonth", unitAmountPence: 9901 },
  GROWTH_99_YEARLY: { priceId: "price_growthyear", unitAmountPence: 99001 },
  PROFESSIONAL_149_MONTHLY: {
    priceId: "price_promonth",
    unitAmountPence: 14901,
  },
  PROFESSIONAL_149_YEARLY: {
    priceId: "price_proyear",
    unitAmountPence: 149001,
  },
  INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY: {
    priceId: "price_monthchild",
    unitAmountPence: 175,
  },
  INSTITUTIONAL_CHILD_101_TO_250_MONTHLY: {
    priceId: "price_monthhigh",
    unitAmountPence: 99,
  },
  INSTITUTIONAL_CHILD_UP_TO_100_YEARLY: {
    priceId: "price_yearchild",
    unitAmountPence: 1234,
  },
  INSTITUTIONAL_CHILD_101_TO_250_YEARLY: {
    priceId: "price_yearhigh",
    unitAmountPence: 812,
  },
  STORAGE_100GB_MONTHLY: {
    priceId: "price_monthstorage",
    unitAmountPence: 149,
  },
  STORAGE_100GB_YEARLY: {
    priceId: "price_yearstorage100",
    unitAmountPence: 1599,
  },
  STORAGE_200GB_MONTHLY: {
    priceId: "price_monthstorage200",
    unitAmountPence: 249,
  },
  STORAGE_200GB_YEARLY: {
    priceId: "price_yearstorage200",
    unitAmountPence: 2499,
  },
  STORAGE_1TB_MONTHLY: {
    priceId: "price_monthstorage1000",
    unitAmountPence: 599,
  },
  STORAGE_1TB_YEARLY: {
    priceId: "price_yearstorage",
    unitAmountPence: 5999,
  },
};

for (const planCode of [
  "INSTITUTIONAL_STARTER_MONTHLY",
  "INSTITUTIONAL_STARTER_YEARLY",
  "INSTITUTIONAL_GROWTH_MONTHLY",
  "INSTITUTIONAL_GROWTH_YEARLY",
  "INSTITUTIONAL_PROFESSIONAL_MONTHLY",
  "INSTITUTIONAL_PROFESSIONAL_YEARLY",
] as const) {
  for (const enrolledChildren of [0, 25, 75, 100, 101, 250]) {
    for (const storageChoice of ["none", "100", "200", "1000"] as const) {
      const quote = calculateMappedInstitutionalQuote({
        planCode,
        enrolledChildren,
        storageChoice,
        prices,
      });
      assert.equal(quote.kind, "priced");
      if (quote.kind !== "priced") continue;
      assert.equal(
        quote.subtotalPence,
        quote.lines.reduce((sum, line) => sum + line.subtotalPence, 0),
      );
      assert.equal(
        quote.lines.filter((line) => line.component === "STORAGE").length,
        storageChoice === "none" ? 0 : 1,
      );
      assert.equal(quote.lines[0].component, "BASE");
      assert.equal(quote.lines[1].component, "CHILDREN_UP_TO_100");
      assert.equal(quote.lines[2].component, "CHILDREN_101_TO_250");
      assert.equal(
        quote.lines[0].priceCode.endsWith("_YEARLY"),
        planCode.endsWith("_YEARLY"),
      );
    }
  }
}

const monthly = calculateMappedInstitutionalQuote({
  planCode: "INSTITUTIONAL_STARTER_MONTHLY",
  enrolledChildren: 26,
  storageChoice: "100",
  prices,
});
assert.equal(monthly.kind, "priced");
if (monthly.kind === "priced") {
  assert.equal(monthly.subtotalPence, 6024);
  assert.deepEqual(
    monthly.lines.map(({ priceId, quantity, unitAmountPence }) => ({
      priceId,
      quantity,
      unitAmountPence,
    })),
    [
      { priceId: "price_monthbase", quantity: 1, unitAmountPence: 5700 },
      { priceId: "price_monthchild", quantity: 1, unitAmountPence: 175 },
      { priceId: "price_monthhigh", quantity: 0, unitAmountPence: 99 },
      { priceId: "price_monthstorage", quantity: 1, unitAmountPence: 149 },
    ],
  );
}

const yearly = calculateMappedInstitutionalQuote({
  planCode: "INSTITUTIONAL_STARTER_YEARLY",
  enrolledChildren: 101,
  storageChoice: "1000",
  prices,
});
assert.equal(yearly.kind, "priced");
if (yearly.kind === "priced") {
  assert.equal(yearly.interval, "year");
  assert.equal(yearly.subtotalPence, 150361);
  assert.deepEqual(
    yearly.lines.map((line) => [line.component, line.quantity]),
    [
      ["BASE", 1],
      ["CHILDREN_UP_TO_100", 75],
      ["CHILDREN_101_TO_250", 1],
      ["STORAGE", 1],
    ],
  );
}

assert.deepEqual(
  calculateMappedInstitutionalQuote({
    planCode: "INSTITUTIONAL_STARTER_MONTHLY",
    enrolledChildren: 251,
    storageChoice: "none",
    prices: {},
  }),
  {
    kind: "contact_sales",
    pricingVersion: "ENROLLED_CHILDREN_V2",
    planCode: "INSTITUTIONAL_STARTER_MONTHLY",
    enrolledChildren: 251,
    reason: "OVER_250_CHILDREN",
  },
);

assert.throws(
  () =>
    calculateMappedInstitutionalQuote({
      planCode: "INSTITUTIONAL_STARTER_YEARLY",
      enrolledChildren: 26,
      storageChoice: "none",
      prices: { STARTER_49_YEARLY: prices.STARTER_49_YEARLY },
    }),
  (error: unknown) =>
    error instanceof InstitutionalMappedPriceError &&
    error.code === "MISSING_PRICE" &&
    error.priceCode === "INSTITUTIONAL_CHILD_UP_TO_100_YEARLY",
);

console.log("institutional mapped pricing: tests passed");
