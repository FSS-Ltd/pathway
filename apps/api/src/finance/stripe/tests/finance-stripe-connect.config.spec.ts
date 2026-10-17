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

  it("rejects non-HTTPS redirects outside local test mode", () => {
    expect(() =>
      loadFinanceStripeConnectConfig(
        { ...billing, activeProvider: "STRIPE" },
        {
          FINANCE_STRIPE_CONNECT_MODE: "live",
          FINANCE_STRIPE_CONNECT_RETURN_URL: "http://school.example/return",
          FINANCE_STRIPE_CONNECT_REFRESH_URL: "https://school.example/refresh",
        },
      ),
    ).toThrow("must use HTTPS");
  });
});
