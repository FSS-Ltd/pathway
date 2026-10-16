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

  it("maps the failed invoice period so stale failures cannot downgrade a renewed subscription", async () => {
    const raw = JSON.stringify({
      id: "evt_failed_1",
      type: "invoice.payment_failed",
      data: {
        object: {
          id: "in_failed_1",
          subscription: "sub_1",
          metadata: { orgId: "org_1" },
          lines: {
            has_more: false,
            data: [
              {
                id: "il_failed_1",
                type: "subscription",
                subscription: "sub_1",
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
    const event = await new StripeBillingWebhookProvider(config).verifyAndParse(
      null,
      signature,
      Buffer.from(raw),
    );
    expect(event).toMatchObject({
      kind: "invoice.payment_failed",
      periodStart: new Date("2030-01-01T00:00:00.000Z"),
    });
  });

  it("preserves consented add-on metadata and the paid price line", async () => {
    const raw = JSON.stringify({
      id: "evt_addon_paid_1",
      type: "invoice.paid",
      data: {
        object: {
          id: "in_addon_paid_1",
          status: "paid",
          currency: "gbp",
          amount_due: 2_000,
          customer: "cus_1",
          subscription: "sub_addon_1",
          metadata: {},
          subscription_details: {
            metadata: {
              orgId: "org_1",
              addonTrialId: "trial_1",
              addonModule: "EVENTS",
              addonInterval: "MONTHLY",
              planCode: "ADD_ON:DECLARED_CAPACITY_EVENTS",
            },
          },
          lines: {
            has_more: false,
            data: [
              {
                id: "il_addon_1",
                type: "subscription",
                subscription: "sub_addon_1",
                price: { id: "price_events_monthly" },
                amount: 2_000,
                quantity: 1,
                proration: false,
                period: { start: 1_896_134_400, end: 1_898_812_800 },
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
    const event = await new StripeBillingWebhookProvider(config).verifyAndParse(
      null,
      signature,
      Buffer.from(raw),
    );

    expect(event).toMatchObject({
      kind: "invoice.paid",
      orgId: "org_1",
      subscriptionId: "sub_addon_1",
      addonTrialId: "trial_1",
      addonModule: "EVENTS",
      addonInterval: "MONTHLY",
      planCode: "ADD_ON:DECLARED_CAPACITY_EVENTS",
      providerCustomerId: "cus_1",
      invoice: {
        status: "paid",
        currency: "gbp",
        linesComplete: true,
        lines: [
          {
            priceId: "price_events_monthly",
            quantity: 1,
            amountPence: 2_000,
            proration: false,
          },
        ],
      },
    });
  });
});
