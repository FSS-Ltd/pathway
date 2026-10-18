import type { FinanceStripeConnectConfig } from "../finance-stripe-connect.config";
import { loadFinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";

describe("loadFinanceStripeCheckoutConfig", () => {
  const testConnect: FinanceStripeConnectConfig = {
    mode: "test",
    secretKey: "sk_test_finance_fixture",
    returnUrl: "https://school.example.test/return",
    refreshUrl: "https://school.example.test/refresh",
  };

  it("uses the application origin for family Checkout return routes", () => {
    expect(
      loadFinanceStripeCheckoutConfig(testConnect, {
        WEB_APP_URL: "https://family.example.test",
      }),
    ).toEqual({
      mode: "test",
      secretKey: "sk_test_finance_fixture",
      webAppUrl: "https://family.example.test",
    });
  });

  it("allows localhost only for test-mode return URLs", () => {
    expect(
      loadFinanceStripeCheckoutConfig(testConnect, {
        WEB_APP_URL: "http://localhost:3000",
      }),
    ).toMatchObject({ webAppUrl: "http://localhost:3000" });
    expect(() =>
      loadFinanceStripeCheckoutConfig(testConnect, {
        WEB_APP_URL: "http://family.example.test",
      }),
    ).toThrow("must use HTTPS");
  });

  it("rejects return URLs with embedded credentials, paths or query state", () => {
    for (const url of [
      "https://user:password@family.example.test",
      "https://family.example.test/family",
      "https://family.example.test?attempt=foreign",
    ]) {
      expect(() =>
        loadFinanceStripeCheckoutConfig(testConnect, { WEB_APP_URL: url }),
      ).toThrow();
    }
  });
});
