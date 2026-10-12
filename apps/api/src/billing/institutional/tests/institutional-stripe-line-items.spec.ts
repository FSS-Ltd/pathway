import { INSTITUTIONAL_PRICING_VERSION } from "@pathway/pricing";
import { stripeItemsForSnapshot } from "../institutional-stripe-line-items";

const priceMap = {
  INSTITUTIONAL_STARTER_MONTHLY: "price_starter",
  INSTITUTIONAL_GROWTH_MONTHLY: "price_growth",
  INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY: "price_first",
  INSTITUTIONAL_CHILD_101_TO_250_MONTHLY: "price_second",
};

const starter = {
  planCode: "INSTITUTIONAL_STARTER_MONTHLY",
  pricingVersion: INSTITUTIONAL_PRICING_VERSION,
  enrolledChildren: 0,
  subtotalPence: 4_900,
  includedModules: [],
  paidModules: [],
};

describe("institutional Stripe line items", () => {
  it("keeps the base charge when the count is zero", () => {
    expect(stripeItemsForSnapshot(starter, priceMap)).toEqual([
      { price: "price_starter", quantity: 1 },
    ]);
  });

  it("uses both non-zero child bands at 250", () => {
    expect(
      stripeItemsForSnapshot(
        { ...starter, enrolledChildren: 250, subtotalPence: 23_650 },
        priceMap,
      ),
    ).toEqual([
      { price: "price_starter", quantity: 1 },
      { price: "price_first", quantity: 75 },
      { price: "price_second", quantity: 150 },
    ]);
  });

  it("rejects stale amounts, unknown counts, and over-250 quotes", () => {
    expect(() =>
      stripeItemsForSnapshot({ ...starter, enrolledChildren: 26 }, priceMap),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
    expect(() =>
      stripeItemsForSnapshot({ ...starter, enrolledChildren: null }, priceMap),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
    expect(() =>
      stripeItemsForSnapshot({ ...starter, enrolledChildren: 251 }, priceMap),
    ).toThrow("INVALID_INSTITUTIONAL_SNAPSHOT");
  });
});
