import { PLANS } from "@pathway/pricing";

describe("Phase 0 PR 0.5: catalogue fallback prices exist for the four target tiers", () => {
  it("STARTER_49, GROWTH_99, and PROFESSIONAL_149 all have a defined fallback price", () => {
    // If Stripe's live price fetch fails, the pricing/buy pages fall back to
    // these catalogue numbers (PLANS.X.pricePerMonth ?? ...) rather than
    // showing a blank or zero price. This only holds if the fallback is
    // actually populated.
    expect(PLANS.STARTER_49_MONTHLY.pricePerMonth).toBeGreaterThan(0);
    expect(PLANS.STARTER_49_YEARLY.pricePerYear).toBeGreaterThan(0);
    expect(PLANS.GROWTH_99_MONTHLY.pricePerMonth).toBeGreaterThan(0);
    expect(PLANS.GROWTH_99_YEARLY.pricePerYear).toBeGreaterThan(0);
    expect(PLANS.PROFESSIONAL_149_MONTHLY.pricePerMonth).toBeGreaterThan(0);
    expect(PLANS.PROFESSIONAL_149_YEARLY.pricePerYear).toBeGreaterThan(0);
  });
});
