import { BillingProvider } from "@pathway/db";
import { calculateMappedInstitutionalQuote } from "@pathway/pricing";
import {
  publicInstitutionalInvoiceMatches,
  publicInstitutionalOrderId,
} from "../institutional-public-order";
import type { ParsedBillingWebhookEvent } from "../../billing-webhook.provider";

const quote = calculateMappedInstitutionalQuote({
  planCode: "INSTITUTIONAL_STARTER_YEARLY",
  enrolledChildren: 101,
  storageChoice: "100",
  prices: {
    STARTER_49_YEARLY: { priceId: "price_base", unitAmountPence: 49000 },
    INSTITUTIONAL_CHILD_UP_TO_100_YEARLY: {
      priceId: "price_first",
      unitAmountPence: 1000,
    },
    INSTITUTIONAL_CHILD_101_TO_250_YEARLY: {
      priceId: "price_second",
      unitAmountPence: 750,
    },
    STORAGE_100GB_YEARLY: {
      priceId: "price_storage",
      unitAmountPence: 10000,
    },
  },
});

if (quote.kind !== "priced") throw new Error("Expected priced test fixture");

const event: ParsedBillingWebhookEvent = {
  provider: BillingProvider.STRIPE,
  eventId: "evt_test",
  kind: "invoice.paid",
  orgId: "",
  subscriptionId: "sub_test",
  invoice: {
    id: "in_test",
    status: "paid",
    currency: "gbp",
    linesComplete: true,
    lines: quote.lines
      .filter((line) => line.quantity > 0)
      .map((line) => ({
        priceId: line.priceId,
        quantity: line.quantity,
        amountPence: line.subtotalPence,
      })),
  },
};

describe("public institutional invoice reconciliation", () => {
  it("accepts the exact frozen annual Price IDs, quantities and amounts", () => {
    expect(publicInstitutionalInvoiceMatches(event, quote)).toBe(true);
  });

  it("rejects an added or changed invoice line", () => {
    const invoice = event.invoice!;
    expect(
      publicInstitutionalInvoiceMatches(
        {
          ...event,
          invoice: {
            ...invoice,
            lines: [
              ...invoice.lines,
              { priceId: "price_unapproved", quantity: 1, amountPence: 1 },
            ],
          },
        },
        quote,
      ),
    ).toBe(false);
    expect(
      publicInstitutionalInvoiceMatches(
        {
          ...event,
          invoice: {
            ...invoice,
            lines: invoice.lines.map((line, index) =>
              index === 0
                ? { ...line, amountPence: line.amountPence + 1 }
                : line,
            ),
          },
        },
        quote,
      ),
    ).toBe(false);
  });

  it("checks draft invoices before they can be finalised", () => {
    const draft = {
      ...event,
      kind: "invoice.draft" as const,
      invoice: { ...event.invoice!, status: "draft" as const },
    };
    expect(publicInstitutionalInvoiceMatches(draft, quote)).toBe(true);
    expect(
      publicInstitutionalInvoiceMatches(
        {
          ...draft,
          invoice: {
            ...draft.invoice,
            linesComplete: false,
          },
        },
        quote,
      ),
    ).toBe(false);
  });

  it("uses a stable unique order ID for each idempotency key", () => {
    expect(publicInstitutionalOrderId("customer-request-a")).toBe(
      publicInstitutionalOrderId("customer-request-a"),
    );
    expect(publicInstitutionalOrderId("customer-request-a")).not.toBe(
      publicInstitutionalOrderId("customer-request-b"),
    );
  });
});
