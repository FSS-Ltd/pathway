import type Stripe from "stripe";
import { institutionalRenewalPhases } from "../institutional-subscription-schedule";

const start = Math.floor(Date.now() / 1000) - 60;
const renewal = start + 30 * 24 * 60 * 60;
const later = renewal + 30 * 24 * 60 * 60;

function phase(startDate: number, endDate: number, snapshotId?: string) {
  return {
    start_date: startDate,
    end_date: endDate,
    items: [{ price: "price_old", quantity: 1, discounts: [] }],
    add_invoice_items: [],
    discounts: [{ coupon: "coupon_1", discount: null, promotion_code: null }],
    default_tax_rates: ["txr_1"],
    metadata: snapshotId ? { institutionalSnapshotId: snapshotId } : {},
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

function schedule(
  phases: ReturnType<typeof phase>[],
): Stripe.SubscriptionSchedule {
  // The test only exercises the phase fields copied by the Stripe adapter.
  return { phases } as unknown as Stripe.SubscriptionSchedule;
}

describe("institutional renewal schedule", () => {
  it("adds a phase without dropping discount, tax, or quantity settings", () => {
    const result = institutionalRenewalPhases(
      schedule([phase(start, renewal)]),
      renewal,
      [{ price: "price_next", quantity: 75 }],
      "INSTITUTIONAL_GROWTH_MONTHLY",
      "snapshot_1",
    );
    expect(result[0]).toMatchObject({
      items: [{ price: "price_old", quantity: 1 }],
      discounts: [{ coupon: "coupon_1" }],
      default_tax_rates: ["txr_1"],
    });
    expect(result[1]).toMatchObject({
      items: [{ price: "price_next", quantity: 75 }],
      metadata: { institutionalSnapshotId: "snapshot_1" },
      proration_behavior: "none",
    });
  });

  it("supersedes only an institutional future phase", () => {
    const result = institutionalRenewalPhases(
      schedule([phase(start, renewal), phase(renewal, later, "snapshot_1")]),
      renewal,
      [{ price: "price_revised", quantity: 1 }],
      "INSTITUTIONAL_STARTER_MONTHLY",
      "snapshot_2",
    );
    expect(result[1]).toMatchObject({
      items: [{ price: "price_revised", quantity: 1 }],
      metadata: { institutionalSnapshotId: "snapshot_2" },
    });
    expect(() =>
      institutionalRenewalPhases(
        schedule([phase(start, renewal), phase(renewal, later)]),
        renewal,
        [{ price: "price_revised", quantity: 1 }],
        "INSTITUTIONAL_STARTER_MONTHLY",
        "snapshot_2",
      ),
    ).toThrow("requires billing review");
  });
});
