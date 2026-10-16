import {
  INSTITUTIONAL_STRIPE_PRICE_SPECS,
  institutionalStripePriceId,
  validateInstitutionalStripePrice,
} from "../institutional-stripe-prices";

describe("institutional Stripe price catalogue", () => {
  it("defines legacy plans and the declared-capacity base and child prices", () => {
    expect(
      INSTITUTIONAL_STRIPE_PRICE_SPECS.map(({ code, unitAmountPence }) => [
        code,
        unitAmountPence,
      ]),
    ).toEqual([
      ["INSTITUTIONAL_STARTER_MONTHLY", 4_900],
      ["INSTITUTIONAL_GROWTH_MONTHLY", 9_900],
      ["INSTITUTIONAL_PROFESSIONAL_MONTHLY", 14_900],
      ["INSTITUTIONAL_CHILD_UP_TO_100_MONTHLY", 100],
      ["INSTITUTIONAL_CHILD_101_TO_250_MONTHLY", 75],
      ["DECLARED_CAPACITY_BASE_MONTHLY", 7_400],
      ["DECLARED_CAPACITY_BASE_YEARLY", 74_000],
      ["DECLARED_CAPACITY_CHILD_MONTHLY", 100],
      ["DECLARED_CAPACITY_CHILD_YEARLY", 1_000],
    ]);
  });

  it("requires a valid mapped price for a chargeable component", () => {
    expect(
      institutionalStripePriceId("INSTITUTIONAL_GROWTH_MONTHLY", {
        INSTITUTIONAL_GROWTH_MONTHLY: "price_test123",
      }),
    ).toBe("price_test123");
    expect(() =>
      institutionalStripePriceId("INSTITUTIONAL_GROWTH_MONTHLY", {}),
    ).toThrow("MISSING_INSTITUTIONAL_PRICE:INSTITUTIONAL_GROWTH_MONTHLY");
    expect(() =>
      institutionalStripePriceId("INSTITUTIONAL_GROWTH_MONTHLY", {
        INSTITUTIONAL_GROWTH_MONTHLY: "prod_wrong",
      }),
    ).toThrow("MISSING_INSTITUTIONAL_PRICE:INSTITUTIONAL_GROWTH_MONTHLY");
  });

  it("rejects wrong amounts and live-mode prices before checkout is enabled", () => {
    const spec = INSTITUTIONAL_STRIPE_PRICE_SPECS[0];
    const correct = {
      active: true,
      currency: "gbp",
      livemode: false,
      product: "prod_test",
      recurring: {
        interval: "month",
        interval_count: 1,
        usage_type: "licensed",
      },
      unit_amount: 4_900,
    };
    expect(() =>
      validateInstitutionalStripePrice(correct, "prod_test", spec),
    ).not.toThrow();
    expect(() =>
      validateInstitutionalStripePrice(
        { ...correct, unit_amount: 5_000 },
        "prod_test",
        spec,
      ),
    ).toThrow("INVALID_INSTITUTIONAL_PRICE:INSTITUTIONAL_STARTER_MONTHLY");
    expect(() =>
      validateInstitutionalStripePrice(
        { ...correct, livemode: true },
        "prod_test",
        spec,
      ),
    ).toThrow("INVALID_INSTITUTIONAL_PRICE:INSTITUTIONAL_STARTER_MONTHLY");
  });
});
