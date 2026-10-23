import { loadFinanceStripeServicingConfig } from "../finance-stripe-servicing.config";
import { loadFinanceStripeWebhookConfig } from "../finance-stripe-webhook.config";
import type { FinanceStripeConnectConfig } from "../finance-stripe-connect.config";

const disabled: FinanceStripeConnectConfig = { mode: "disabled" };
const testConnect: FinanceStripeConnectConfig = {
  mode: "test",
  secretKey: "sk_test_collection",
  returnUrl: "https://example.test/return",
  refreshUrl: "https://example.test/refresh",
};
const testEnv = {
  FINANCE_STRIPE_SERVICING_MODE: "test",
  FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST: "rk_test_servicing",
};
const liveEnv = {
  NODE_ENV: "production",
  VERCEL_ENV: "production",
  FINANCE_STRIPE_SERVICING_MODE: "live",
  FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE: "rk_live_servicing",
};

describe("Finance servicing configuration", () => {
  it("defaults to disabled without collection or explicit servicing configuration", () => {
    expect(loadFinanceStripeServicingConfig(disabled, {})).toEqual(disabled);
  });

  it("preserves existing enabled collection configuration", () => {
    expect(loadFinanceStripeServicingConfig(testConnect, {})).toEqual({
      mode: "test",
      secretKey: "sk_test_collection",
    });
  });

  it("continues servicing with collection disabled using a separate restricted key", () => {
    expect(loadFinanceStripeServicingConfig(disabled, testEnv)).toEqual({
      mode: "test",
      secretKey: "rk_test_servicing",
    });
  });

  it("continues existing live servicing when the collection live switch is off", () => {
    expect(
      loadFinanceStripeServicingConfig(disabled, {
        ...liveEnv,
        FINANCE_STRIPE_LIVE_ENABLED: "false",
      }),
    ).toEqual({ mode: "live", secretKey: "rk_live_servicing" });
  });

  it("keeps signed webhook processing available after new collection is disabled", () => {
    const servicing = loadFinanceStripeServicingConfig(disabled, testEnv);
    expect(
      loadFinanceStripeWebhookConfig(servicing, {
        FINANCE_STRIPE_WEBHOOK_SECRET_TEST: "whsec_finance_servicing",
      }),
    ).toEqual({
      mode: "test",
      secretKey: "rk_test_servicing",
      webhookSecret: "whsec_finance_servicing",
    });
  });

  it.each([
    { ...testEnv, FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST: "sk_live_wrong" },
    { ...liveEnv, FINANCE_STRIPE_SERVICING_SECRET_KEY_LIVE: "rk_test_wrong" },
    { ...testEnv, FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST: "pk_test_public" },
    { ...testEnv, FINANCE_STRIPE_SERVICING_SECRET_KEY_TEST: "" },
    {
      FINANCE_STRIPE_SERVICING_MODE: "test",
      STRIPE_SECRET_KEY_TEST: "sk_test_no_fallback",
    },
  ])("rejects missing, public or wrong-environment credentials", (env) => {
    expect(() => loadFinanceStripeServicingConfig(disabled, env)).toThrow(
      "servicing",
    );
  });

  it.each([
    { ...liveEnv, VERCEL_ENV: "preview" },
    { ...liveEnv, NODE_ENV: "development" },
    { ...testEnv, NODE_ENV: "production", VERCEL_ENV: "production" },
  ])("rejects cross-environment servicing", (env) => {
    expect(() => loadFinanceStripeServicingConfig(disabled, env)).toThrow(
      "servicing",
    );
  });

  it("rejects an invalid mode and mixed collection/servicing environments", () => {
    expect(() =>
      loadFinanceStripeServicingConfig(disabled, {
        FINANCE_STRIPE_SERVICING_MODE: "sandbox",
      }),
    ).toThrow("servicing");
    expect(() =>
      loadFinanceStripeServicingConfig(testConnect, liveEnv),
    ).toThrow("servicing");
  });

  it("supports an explicit servicing emergency stop", () => {
    expect(
      loadFinanceStripeServicingConfig(testConnect, {
        FINANCE_STRIPE_SERVICING_MODE: "disabled",
      }),
    ).toEqual(disabled);
  });
});
