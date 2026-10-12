import Stripe from "stripe";
import { StripeBillingWebhookProvider } from "../providers/stripe-billing-webhook.provider";
import type { BillingProviderConfig } from "../billing-provider.config";

describe("Stripe institutional invoice webhook mapping", () => {
  const secret = "whsec_institutional_test";
  const config: BillingProviderConfig = {
    activeProvider: "STRIPE_TEST",
    stripe: { secretKey: "sk_test_dummy", webhookSecretSnapshot: secret },
    goCardless: {},
  };
  const stripe = new Stripe("sk_test_dummy", { apiVersion: "2023-10-16" });

  it("maps a signed draft invoice with complete item amounts and period", async () => {
    const raw = JSON.stringify({
      id: "evt_draft_1",
      type: "invoice.created",
      data: {
        object: {
          id: "in_draft_1",
          status: "draft",
          currency: "gbp",
          metadata: {},
          subscription_details: {
            metadata: { orgId: "org_1", pendingOrderId: "order_1" },
          },
          subscription: "sub_1",
          lines: {
            has_more: false,
            data: [
              {
                id: "il_1",
                type: "subscription",
                subscription: "sub_1",
                price: { id: "price_starter123" },
                amount: 4_900,
                quantity: 1,
                period: { start: 1_893_456_000, end: 1_896_134_400 },
              },
            ],
          },
        },
      },
    });
    const signature = stripe.webhooks.generateTestHeaderString({
      payload: raw,
      secret,
    });
    const provider = new StripeBillingWebhookProvider(config);

    const event = await provider.verifyAndParse(
      null,
      signature,
      Buffer.from(raw),
    );

    expect(event).toMatchObject({
      kind: "invoice.draft",
      orgId: "org_1",
      pendingOrderId: "order_1",
      subscriptionId: "sub_1",
      periodStart: new Date("2030-01-01T00:00:00.000Z"),
      invoice: {
        id: "in_draft_1",
        status: "draft",
        currency: "gbp",
        linesComplete: true,
        lines: [
          { priceId: "price_starter123", quantity: 1, amountPence: 4_900 },
        ],
      },
    });
  });

  it("refuses provider invoice writes while the institutional switch is off", async () => {
    const provider = new StripeBillingWebhookProvider(config);
    const old = process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
    delete process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
    try {
      await expect(provider.holdDraftInvoice("in_draft_1")).rejects.toThrow(
        "Institutional draft invoice hold is disabled",
      );
    } finally {
      if (old === undefined)
        delete process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED;
      else process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED = old;
    }
  });
});
