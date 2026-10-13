import type { BillingProviderConfig } from "../../billing-provider.config";
import { institutionalStripeKey } from "../institutional-provider-guard";

const config = (provider: "STRIPE" | "STRIPE_TEST", key: string) =>
  ({
    activeProvider: provider,
    stripe: { secretKey: key },
    goCardless: {},
  }) satisfies BillingProviderConfig;

describe("institutional Stripe environment guard", () => {
  const previous = { ...process.env };

  beforeEach(() => {
    process.env.INSTITUTIONAL_CHECKOUT_ENABLED = "true";
    process.env.INSTITUTIONAL_PROVIDER_WRITES_ENABLED = "true";
    delete process.env.INSTITUTIONAL_LIVE_ACTIVATION_VERIFIED;
  });

  afterAll(() => {
    process.env = previous;
  });

  it("rejects an environment mismatch", () => {
    expect(() =>
      institutionalStripeKey(config("STRIPE", "sk_test_wrong"), "CHECKOUT"),
    ).toThrow();
  });

  it("keeps live activation disabled without the independent gate", () => {
    expect(() =>
      institutionalStripeKey(config("STRIPE", "sk_live_example"), "CHECKOUT"),
    ).toThrow();
  });

  it("permits matching test credentials behind both switches", () => {
    expect(
      institutionalStripeKey(
        config("STRIPE_TEST", "sk_test_example"),
        "CHECKOUT",
      ),
    ).toBe("sk_test_example");
    expect(
      institutionalStripeKey(
        config("STRIPE_TEST", "rk_test_example"),
        "PROVIDER_WRITES",
      ),
    ).toBe("rk_test_example");
  });
});
