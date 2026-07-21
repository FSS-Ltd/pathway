import { loadBillingProviderConfig } from "../billing-provider.config";

const originalEnv = { ...process.env };

describe("billing provider config", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to FAKE when env is missing and Stripe keys absent", () => {
    delete process.env.BILLING_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT;
    const config = loadBillingProviderConfig();
    expect(config.activeProvider).toBe("FAKE");
  });

  it("loads STRIPE config and price map when env is set", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP =
      '{"STARTER_MONTHLY":"price_starter_m","GROWTH_MONTHLY":"price_growth_m"}';
    const config = loadBillingProviderConfig();
    expect(config.activeProvider).toBe("STRIPE");
    expect(config.stripe.priceMap?.STARTER_MONTHLY).toBe("price_starter_m");
    expect(config.stripe.webhookSecretSnapshot).toBe("whsec_snapshot");
  });

  it("parses STRIPE_PRICE_MAP when stored as single-quoted escaped JSON (e.g. GitHub Secrets)", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    // Simulates value that was double-encoded: outer single quotes, inner \" and \n
    process.env.STRIPE_PRICE_MAP =
      "'{\\n \"STARTER_MONTHLY\":\"price_starter_m\",\\n \"GROWTH_MONTHLY\":\"price_growth_m\"\\n}'";
    const config = loadBillingProviderConfig();
    expect(config.activeProvider).toBe("STRIPE");
    expect(config.stripe.priceMap?.STARTER_MONTHLY).toBe("price_starter_m");
    expect(config.stripe.priceMap?.GROWTH_MONTHLY).toBe("price_growth_m");
    expect(config.stripe.priceMapDiagnostics?.parseSuccess).toBe(true);
  });

  it("uses STRIPE when BILLING_PROVIDER unset but Stripe keys present (fallback)", () => {
    delete process.env.BILLING_PROVIDER;
    process.env.STRIPE_SECRET_KEY = "sk_live_xxx";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_live";
    const config = loadBillingProviderConfig();
    expect(config.activeProvider).toBe("STRIPE");
  });

  it("stays FAKE when BILLING_PROVIDER unset and Stripe keys missing", () => {
    delete process.env.BILLING_PROVIDER;
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT;
    const config = loadBillingProviderConfig();
    expect(config.activeProvider).toBe("FAKE");
  });

  it("Phase 0 PR 0.3: rejects the removed SMS add-on price code from STRIPE_PRICE_MAP", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP = JSON.stringify({
      STARTER_MONTHLY: "price_starter_m",
      SMS_1000_MONTHLY: "price_sms_should_be_filtered",
    });
    const config = loadBillingProviderConfig();
    expect(config.stripe.priceMap?.STARTER_MONTHLY).toBe("price_starter_m");
    expect(
      (config.stripe.priceMap as Record<string, string> | undefined)?.SMS_1000_MONTHLY,
    ).toBeUndefined();
  });

  it("Phase 0 PR 0.4: rejects the removed AV30 block price codes from STRIPE_PRICE_MAP", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP = JSON.stringify({
      STARTER_MONTHLY: "price_starter_m",
      AV30_BLOCK_25_MONTHLY: "price_av30_should_be_filtered",
      AV30_BLOCK_50_YEARLY: "price_av30_should_also_be_filtered",
    });
    const config = loadBillingProviderConfig();
    expect(config.stripe.priceMap?.STARTER_MONTHLY).toBe("price_starter_m");
    const priceMap = config.stripe.priceMap as Record<string, string> | undefined;
    expect(priceMap?.AV30_BLOCK_25_MONTHLY).toBeUndefined();
    expect(priceMap?.AV30_BLOCK_50_YEARLY).toBeUndefined();
  });

  it("Phase 0 PR 0.2: accepts the new target-tier price codes in STRIPE_PRICE_MAP", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP = JSON.stringify({
      STARTER_49_MONTHLY: "price_starter49_m",
      GROWTH_99_MONTHLY: "price_growth99_m",
      PROFESSIONAL_149_MONTHLY: "price_pro149_m",
    });
    const config = loadBillingProviderConfig();
    expect(config.stripe.priceMap?.STARTER_49_MONTHLY).toBe("price_starter49_m");
    expect(config.stripe.priceMap?.GROWTH_99_MONTHLY).toBe("price_growth99_m");
    expect(config.stripe.priceMap?.PROFESSIONAL_149_MONTHLY).toBe("price_pro149_m");
  });

  it("Phase 3 PR 3.1: accepts module price codes in STRIPE_PRICE_MAP", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP = JSON.stringify({
      MODULE_FINANCE_MONTHLY: "price_fin_m",
      MODULE_AI_WORKSPACE_YEARLY: "price_ai_y",
    });

    const config = loadBillingProviderConfig();

    expect(config.stripe.priceMap?.MODULE_FINANCE_MONTHLY).toBe("price_fin_m");
    expect(config.stripe.priceMap?.MODULE_AI_WORKSPACE_YEARLY).toBe("price_ai_y");
  });

  it("accepts Learning module price codes in STRIPE_PRICE_MAP", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP = JSON.stringify({
      MODULE_LEARNING_MONTHLY: "price_learning_m",
      MODULE_LEARNING_YEARLY: "price_learning_y",
    });

    const config = loadBillingProviderConfig();

    expect(config.stripe.priceMap?.MODULE_LEARNING_MONTHLY).toBe("price_learning_m");
    expect(config.stripe.priceMap?.MODULE_LEARNING_YEARLY).toBe("price_learning_y");
  });

  it("Phase 3 PR 3.1: filters unknown module price codes from STRIPE_PRICE_MAP", () => {
    process.env.BILLING_PROVIDER = "STRIPE";
    process.env.STRIPE_SECRET_KEY = "sk_test";
    process.env.STRIPE_WEBHOOK_SECRET_SNAPSHOT = "whsec_snapshot";
    process.env.STRIPE_PRICE_MAP = JSON.stringify({
      MODULE_FINANCE_MONTHLY: "price_fin_m",
      MODULE_NOT_A_REAL_ONE_MONTHLY: "price_bogus",
    });

    const config = loadBillingProviderConfig();
    const priceMap = config.stripe.priceMap as Record<string, string> | undefined;

    expect(priceMap?.MODULE_FINANCE_MONTHLY).toBe("price_fin_m");
    expect(priceMap?.MODULE_NOT_A_REAL_ONE_MONTHLY).toBeUndefined();
  });
});
