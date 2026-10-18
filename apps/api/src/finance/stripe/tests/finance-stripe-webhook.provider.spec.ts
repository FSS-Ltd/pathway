import Stripe from "stripe";
import type { FinanceStripeWebhookConfig } from "../finance-stripe-webhook.config";
import { FinanceStripeWebhookProvider } from "../finance-stripe-webhook.provider";

describe("FinanceStripeWebhookProvider", () => {
  const webhookSecret = "whsec_finance_unit_fixture";
  const config = {
    mode: "test",
    secretKey: "sk_test_finance_unit_fixture",
    webhookSecret,
  } satisfies Exclude<FinanceStripeWebhookConfig, { mode: "disabled" }>;
  const rawBody = Buffer.from(
    JSON.stringify({
      id: "evt_finance_unit_001",
      object: "event",
      api_version: "2026-09-30.endive",
      created: 1_797_000_000,
      data: {
        object: {
          id: "pi_finance_unit_001",
          object: "payment_intent",
          amount: 2_900,
          currency: "gbp",
          status: "succeeded",
        },
      },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: "payment_intent.succeeded",
      account: "acct_finance_unit_001",
    }),
  );

  function signature(
    payload: Buffer = rawBody,
    secret = webhookSecret,
  ): string {
    const stripe = new Stripe(config.secretKey, { apiVersion: "2023-10-16" });
    return stripe.webhooks.generateTestHeaderString({
      payload: payload.toString("utf8"),
      secret,
    });
  }

  it("verifies the exact raw body and returns replay evidence", () => {
    const provider = new FinanceStripeWebhookProvider(config);

    const verified = provider.verifyAndParse(rawBody, signature());

    expect(verified).toMatchObject({
      eventId: "evt_finance_unit_001",
      accountId: "acct_finance_unit_001",
      eventType: "payment_intent.succeeded",
      livemode: false,
      payloadJson: rawBody.toString("utf8"),
    });
    expect(verified.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("maps Accounts v2 event context to the connected account", () => {
    const v2AccountId = "acct_finance_v2_unit_002";
    const v2Body = Buffer.from(
      JSON.stringify({
        id: "evt_finance_v2_unit_002",
        object: "v2.core.event",
        context: v2AccountId,
        created: 1_797_000_001,
        livemode: false,
        type: "v2.core.account[requirements].updated",
        related_object: { id: v2AccountId, type: "account" },
      }),
    );
    const provider = new FinanceStripeWebhookProvider(config);

    const verified = provider.verifyAndParse(v2Body, signature(v2Body));

    expect(verified).toMatchObject({
      eventId: "evt_finance_v2_unit_002",
      accountId: v2AccountId,
      eventType: "v2.core.account[requirements].updated",
    });
  });

  it("does not treat unrelated v2 contexts as connected-account IDs", () => {
    const v2Body = Buffer.from(
      JSON.stringify({
        id: "evt_finance_v2_unit_003",
        object: "v2.core.event",
        context: "context_without_account_id",
        created: 1_797_000_002,
        livemode: false,
        type: "v2.core.account[requirements].updated",
        related_object: { id: "acct_finance_v2_unit_003", type: "account" },
      }),
    );
    const provider = new FinanceStripeWebhookProvider(config);

    const verified = provider.verifyAndParse(v2Body, signature(v2Body));

    expect(verified.accountId).toBeNull();
  });

  it("rejects a missing raw body instead of reconstructing JSON", () => {
    const provider = new FinanceStripeWebhookProvider(config);

    expect(() => provider.verifyAndParse(undefined, signature())).toThrow(
      "Raw Stripe webhook body is required",
    );
  });

  it("rejects an invalid signature without exposing the signature error", () => {
    const provider = new FinanceStripeWebhookProvider(config);

    expect(() => provider.verifyAndParse(rawBody, "t=1,v1=invalid")).toThrow(
      "Invalid Stripe webhook signature",
    );
  });

  it("rejects a signed event from the wrong Stripe mode", () => {
    const liveBody = Buffer.from(
      rawBody.toString("utf8").replace('"livemode":false', '"livemode":true'),
    );
    const provider = new FinanceStripeWebhookProvider(config);

    expect(() =>
      provider.verifyAndParse(liveBody, signature(liveBody)),
    ).toThrow("Stripe webhook mode does not match Finance configuration");
  });
});
