import { InstitutionalSnapshotStatus, BillingProvider } from "@pathway/db";
import type { ParsedBillingWebhookEvent } from "../../billing-webhook.provider";
import { capacityUpgradeInvoiceMatches } from "../institutional-capacity-invoice";

const snapshot = {
  status: InstitutionalSnapshotStatus.PRICED,
  amountDueNowPence: 1_250,
  prorationLines: [
    { priceId: "price_capacity", quantity: 1, amountPence: 1_250 },
  ],
};

function invoiceEvent(
  overrides: Partial<NonNullable<ParsedBillingWebhookEvent["invoice"]>> = {},
  kind: "invoice.draft" | "invoice.paid" = "invoice.paid",
): ParsedBillingWebhookEvent {
  return {
    provider: BillingProvider.STRIPE,
    eventId: "evt_capacity",
    kind,
    orgId: "org_1",
    subscriptionId: "sub_1",
    invoice: {
      id: "in_1",
      status: kind === "invoice.paid" ? "paid" : "draft",
      currency: "gbp",
      amountDuePence: 1_250,
      linesComplete: true,
      lines: [
        {
          priceId: "price_capacity",
          quantity: 1,
          amountPence: 1_250,
          proration: true,
        },
      ],
      ...overrides,
    },
  };
}

describe("capacityUpgradeInvoiceMatches", () => {
  it("matches frozen proration lines and the provider amount due", () => {
    expect(capacityUpgradeInvoiceMatches(invoiceEvent(), snapshot)).toBe(true);
  });

  it("accepts non-proration invoice rows only when the proration and amount match", () => {
    expect(
      capacityUpgradeInvoiceMatches(
        invoiceEvent({
          lines: [
            {
              priceId: "price_capacity",
              quantity: 1,
              amountPence: 1_250,
              proration: true,
            },
            {
              priceId: "price_zero",
              quantity: 1,
              amountPence: 0,
              proration: false,
            },
          ],
        }),
        snapshot,
      ),
    ).toBe(true);
  });

  it("rejects a changed invoice amount, line, currency, status, or incomplete lines", () => {
    expect(
      capacityUpgradeInvoiceMatches(
        invoiceEvent({ amountDuePence: 1_251 }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      capacityUpgradeInvoiceMatches(
        invoiceEvent({
          lines: [
            {
              priceId: "price_capacity",
              quantity: 1,
              amountPence: 1_251,
              proration: true,
            },
          ],
        }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      capacityUpgradeInvoiceMatches(
        invoiceEvent({ currency: "usd" }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      capacityUpgradeInvoiceMatches(
        invoiceEvent({ status: "other" }),
        snapshot,
      ),
    ).toBe(false);
    expect(
      capacityUpgradeInvoiceMatches(
        invoiceEvent({ linesComplete: false }),
        snapshot,
      ),
    ).toBe(false);
  });
});
