import type { FinanceStripeConnectConfig } from "../finance-stripe-connect.config";
import { loadFinanceStripeWebhookConfig } from "../finance-stripe-webhook.config";

describe("Finance Stripe webhook configuration", () => {
  const testConnect: FinanceStripeConnectConfig = {
    mode: "test",
    secretKey: "sk_test_finance_fixture",
    returnUrl: "https://school.example/return",
    refreshUrl: "https://school.example/refresh",
  };
  const liveConnect: FinanceStripeConnectConfig = {
    ...testConnect,
    mode: "live",
    secretKey: "sk_live_finance_fixture",
  };

  it("stays disabled until a Finance endpoint secret is configured", () => {
    expect(loadFinanceStripeWebhookConfig(testConnect, {})).toEqual({
      mode: "disabled",
    });
  });

  it("uses the test Finance secret without SaaS or live-secret fallbacks", () => {
    expect(
      loadFinanceStripeWebhookConfig(testConnect, {
        STRIPE_WEBHOOK_SECRET_TEST: "whsec_saas_test_fixture",
        FINANCE_STRIPE_WEBHOOK_SECRET_LIVE: "whsec_finance_live_fixture",
      }),
    ).toEqual({ mode: "disabled" });

    expect(
      loadFinanceStripeWebhookConfig(testConnect, {
        FINANCE_STRIPE_WEBHOOK_SECRET_TEST: "whsec_finance_test_fixture",
        FINANCE_STRIPE_WEBHOOK_SECRET_LIVE: "whsec_finance_live_fixture",
      }),
    ).toEqual({
      mode: "test",
      secretKey: "sk_test_finance_fixture",
      webhookSecret: "whsec_finance_test_fixture",
    });
  });

  it("uses only the live Finance endpoint secret in live mode", () => {
    expect(
      loadFinanceStripeWebhookConfig(liveConnect, {
        FINANCE_STRIPE_WEBHOOK_SECRET_TEST: "whsec_finance_test_fixture",
      }),
    ).toEqual({ mode: "disabled" });
    expect(
      loadFinanceStripeWebhookConfig(liveConnect, {
        FINANCE_STRIPE_WEBHOOK_SECRET_LIVE: "whsec_finance_live_fixture",
      }),
    ).toEqual({
      mode: "live",
      secretKey: "sk_live_finance_fixture",
      webhookSecret: "whsec_finance_live_fixture",
    });
  });
});
