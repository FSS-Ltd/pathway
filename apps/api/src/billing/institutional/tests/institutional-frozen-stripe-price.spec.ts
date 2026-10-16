import { validateFrozenStripePrice } from "../institutional-frozen-stripe-price";
import { DECLARED_CAPACITY_PRICING_VERSION } from "@pathway/pricing";

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
  tax_behavior: "exclusive",
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

  it("requires tax-inclusive Stripe prices for declared-capacity snapshots", () => {
    const declaredCapacitySnapshot = {
      ...snapshot,
      planCode: "DECLARED_CAPACITY_STARTER_YEARLY",
      pricingVersion: DECLARED_CAPACITY_PRICING_VERSION,
    };
    const taxInclusivePrice = { ...price, tax_behavior: "inclusive" };

    expect(() =>
      validateFrozenStripePrice(
        taxInclusivePrice,
        declaredCapacitySnapshot,
        "price_accepted",
        true,
      ),
    ).not.toThrow();
    expect(() =>
      validateFrozenStripePrice(
        price,
        declaredCapacitySnapshot,
        "price_accepted",
        true,
      ),
    ).toThrow("INSTITUTIONAL_PRICE_CHANGED");
  });
});
