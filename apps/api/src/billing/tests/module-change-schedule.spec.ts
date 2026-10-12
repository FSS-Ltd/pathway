import type Stripe from "stripe";
import {
  phasesForCancellation,
  phasesForRenewal,
} from "../module-change-schedule";

const start = Math.floor(Date.now() / 1000) - 60;
const renewal = start + 30 * 24 * 60 * 60;
const later = renewal + 30 * 24 * 60 * 60;

function schedule(
  phases: Array<Record<string, unknown>>,
): Stripe.SubscriptionSchedule {
  // Only the Stripe phase fields consumed by the scheduling adapter are needed.
  return { phases } as unknown as Stripe.SubscriptionSchedule;
}

function phase(startDate: number, endDate: number): Record<string, unknown> {
  return {
    start_date: startDate,
    end_date: endDate,
    items: [
      { price: "price_base", quantity: 2, tax_rates: ["txr_1"], discounts: [] },
    ],
    add_invoice_items: [],
    discounts: [{ coupon: "coupon_1", discount: null, promotion_code: null }],
    default_tax_rates: ["txr_1"],
    metadata: { existing: "value" },
    currency: "gbp",
    proration_behavior: "none",
    application_fee_percent: null,
    billing_cycle_anchor: null,
    billing_thresholds: null,
    collection_method: "charge_automatically",
    coupon: null,
    default_payment_method: null,
    description: null,
    invoice_settings: null,
    on_behalf_of: null,
    transfer_data: null,
    trial_end: null,
  };
}

describe("module change schedule phases", () => {
  it("preserves current settings and starts a non-prorated renewal phase", () => {
    const result = phasesForRenewal(
      schedule([phase(start, renewal)]),
      renewal,
      [{ price: "price_next", quantity: 1 }],
      "GROWTH_99_MONTHLY",
    );
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      items: [{ price: "price_base", quantity: 2, tax_rates: ["txr_1"] }],
      discounts: [{ coupon: "coupon_1" }],
      default_tax_rates: ["txr_1"],
    });
    expect(result[1]).toMatchObject({
      start_date: renewal,
      iterations: 1,
      items: [{ price: "price_next", quantity: 1 }],
      metadata: { existing: "value", planCode: "GROWTH_99_MONTHLY" },
      proration_behavior: "none",
    });
  });

  it("refuses a renewal change that would be undone by a later phase", () => {
    expect(() =>
      phasesForRenewal(
        schedule([
          phase(start, later),
          phase(later, later + 30 * 24 * 60 * 60),
        ]),
        renewal,
        [{ price: "price_next", quantity: 1 }],
        "STARTER_49_MONTHLY",
      ),
    ).toThrow("A later subscription phase needs billing review");
  });

  it("recognises a retried transition already present in the schedule", () => {
    const scheduled = phase(renewal, later);
    scheduled.items = [{ price: "price_next", quantity: 1, discounts: [] }];
    scheduled.metadata = { planCode: "STARTER_49_MONTHLY" };
    const result = phasesForRenewal(
      schedule([phase(start, renewal), scheduled]),
      renewal,
      [{ price: "price_next", quantity: 1 }],
      "STARTER_49_MONTHLY",
    );
    expect(result).toHaveLength(2);
  });

  it("ends a separately billed add-on at the base renewal while preserving current settings", () => {
    const result = phasesForCancellation(
      schedule([phase(start, later), phase(later, later + 30 * 24 * 60 * 60)]),
      renewal,
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      start_date: start,
      end_date: renewal,
      items: [{ price: "price_base", quantity: 2 }],
      discounts: [{ coupon: "coupon_1" }],
      proration_behavior: "none",
    });
  });
});
