import type { BillingProviderConfig } from "../../../billing/billing-provider.config";
import { loadFinanceStripeConnectConfig } from "../finance-stripe-connect.config";

describe("Finance Stripe Connect configuration", () => {
  const billing: BillingProviderConfig = {
    activeProvider: "STRIPE_TEST",
    stripe: { secretKey: "sk_test_unit_fixture" },
    goCardless: {},
  };

  it("stays disabled unless the environment opts in", () => {
    expect(loadFinanceStripeConnectConfig(billing, {})).toEqual({
      mode: "disabled",
    });
  });

  it("rejects invalid or orphaned live switch values", () => {
    expect(() =>
      loadFinanceStripeConnectConfig(billing, {
        FINANCE_STRIPE_LIVE_ENABLED: "true",
      }),
    ).toThrow("requires FINANCE_STRIPE_CONNECT_MODE=live");
    expect(() =>
      loadFinanceStripeConnectConfig(billing, {
        FINANCE_STRIPE_LIVE_ENABLED: "enabled",
      }),
    ).toThrow("FINANCE_STRIPE_LIVE_ENABLED must be true or false");
  });

  it("requires a matching provider mode and explicit secure redirect URLs", () => {
    expect(() =>
      loadFinanceStripeConnectConfig(
        { ...billing, activeProvider: "FAKE" },
        {
          FINANCE_STRIPE_CONNECT_MODE: "test",
          FINANCE_STRIPE_CONNECT_RETURN_URL: "https://school.example/return",
          FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
        },
      ),
    ).toThrow("requires the matching Stripe billing provider");

    expect(
      loadFinanceStripeConnectConfig(billing, {
        FINANCE_STRIPE_CONNECT_MODE: "test",
        FINANCE_STRIPE_CONNECT_RETURN_URL: "http://localhost:3000/return",
        FINANCE_STRIPE_CONNECT_REFRESH_URL: "http://localhost:3000/refresh",
      }),
    ).toMatchObject({ mode: "test" });
  });

  it("requires an explicit Vercel Production opt-in for live Connect", () => {
    const liveBilling: BillingProviderConfig = {
      ...billing,
      activeProvider: "STRIPE",
      stripe: { secretKey: "sk_live_unit_fixture" },
    };
    const productionEnv = {
      FINANCE_STRIPE_CONNECT_MODE: "live",
      FINANCE_STRIPE_LIVE_ENABLED: "true",
      FINANCE_STRIPE_CONNECT_RETURN_URL: "https://school.example/return",
      FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
      NODE_ENV: "production",
      VERCEL_ENV: "production",
    };

    expect(
      loadFinanceStripeConnectConfig(liveBilling, productionEnv),
    ).toMatchObject({ mode: "live" });
    expect(() =>
      loadFinanceStripeConnectConfig(liveBilling, {
        ...productionEnv,
        FINANCE_STRIPE_LIVE_ENABLED: "false",
      }),
    ).toThrow("requires an explicit production opt-in");
    expect(() =>
      loadFinanceStripeConnectConfig(liveBilling, {
        ...productionEnv,
        VERCEL_ENV: "preview",
      }),
    ).toThrow("requires an explicit production opt-in");
  });

  it("rejects Finance test mode in a production runtime", () => {
    expect(() =>
      loadFinanceStripeConnectConfig(billing, {
        FINANCE_STRIPE_CONNECT_MODE: "test",
        FINANCE_STRIPE_CONNECT_RETURN_URL: "https://school.example/return",
        FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
        NODE_ENV: "production",
        VERCEL_ENV: "production",
      }),
    ).toThrow("Finance test mode is unavailable in a production runtime");

    expect(() =>
      loadFinanceStripeConnectConfig(billing, {
        FINANCE_STRIPE_CONNECT_MODE: "test",
        FINANCE_STRIPE_CONNECT_RETURN_URL: "https://school.example/return",
        FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
        NODE_ENV: "production",
      }),
    ).toThrow("Finance test mode is unavailable in a production runtime");
  });

  it("rejects non-HTTPS redirects outside local test mode", () => {
    expect(() =>
      loadFinanceStripeConnectConfig(
        { ...billing, activeProvider: "STRIPE" },
        {
          FINANCE_STRIPE_CONNECT_MODE: "live",
          FINANCE_STRIPE_LIVE_ENABLED: "true",
          FINANCE_STRIPE_CONNECT_RETURN_URL: "http://school.example/return",
          FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
          NODE_ENV: "production",
          VERCEL_ENV: "production",
        },
      ),
    ).toThrow("must use HTTPS");
  });
});
