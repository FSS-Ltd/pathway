import { validateFrozenStripePrice } from "../institutional-frozen-stripe-price";

const snapshot = {
  planCode: "INSTITUTIONAL_STARTER_YEARLY",
  lines: [
    { priceId: "price_accepted", currency: "GBP", unitAmountPence: 1000 },
  ],
};

const price = {
  id: "price_accepted",
  active: true,
  livemode: true,
  currency: "gbp",
  unit_amount: 1000,
  recurring: { interval: "year", interval_count: 1, usage_type: "licensed" },
};

describe("frozen institutional checkout Price validation", () => {
  it("uses accepted terms even if the configured map later changes", () => {
    expect(() =>
      validateFrozenStripePrice(price, snapshot, "price_accepted", true),
    ).not.toThrow();
  });

  it("rejects a changed amount or environment", () => {
    expect(() =>
      validateFrozenStripePrice(
        { ...price, unit_amount: 1001 },
        snapshot,
        "price_accepted",
        true,
      ),
    ).toThrow();
    expect(() =>
      validateFrozenStripePrice(price, snapshot, "price_accepted", false),
    ).toThrow();
  });

  it("rejects the wrong billing interval", () => {
    expect(() =>
      validateFrozenStripePrice(
        { ...price, recurring: { ...price.recurring, interval: "month" } },
        snapshot,
        "price_accepted",
        true,
      ),
    ).toThrow();
  });
});
