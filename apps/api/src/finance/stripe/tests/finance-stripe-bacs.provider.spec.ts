import type { FinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";
import {
  FinanceStripeBacsProviderError,
  StripeFinanceBacsProvider,
} from "../finance-stripe-bacs.provider";

const testConfig = {
  mode: "test",
  secretKey: "sk_test_finance_fixture",
  webAppUrl: "https://family.example.test",
} satisfies Extract<FinanceStripeCheckoutConfig, { mode: "test" }>;

function stripeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StripeFinanceBacsProvider", () => {
  it("creates a payer customer inside the school's connected account", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(
        stripeResponse({ id: "cus_school_payer", livemode: false }),
      );
    const provider = new StripeFinanceBacsProvider(testConfig, fetcher);

    await expect(
      provider.createCustomer({
        stripeAccountId: "acct_school_test",
        payerAccountId: "payer-1",
        displayName: "Alex Example",
        idempotencyKey: "finance-customer-school-payer-1",
      }),
    ).resolves.toEqual({ id: "cus_school_payer" });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/customers");
    expect(init.headers).toMatchObject({
      "Stripe-Account": "acct_school_test",
      "Idempotency-Key": "finance-customer-school-payer-1",
    });
    const form = new URLSearchParams(String(init.body));
    expect(form.get("name")).toBe("Alex Example");
    expect(form.get("metadata[finance_payer_account_id]")).toBe("payer-1");
  });

  it("creates hosted Bacs setup with off-session consent and no custom branding", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        id: "cs_test_mandate",
        livemode: false,
        url: "https://checkout.stripe.com/c/pay/cs_test_mandate",
        expires_at: 1_800_000_000,
      }),
    );
    const provider = new StripeFinanceBacsProvider(testConfig, fetcher);

    await expect(
      provider.createMandateSetupSession({
        stripeAccountId: "acct_school_test",
        stripeCustomerId: "cus_school_payer",
        mandateId: "mandate-1",
        payerAccountId: "payer-1",
        consentVersion: "bacs-2026-01",
        idempotencyKey: "finance-mandate-setup-1",
      }),
    ).resolves.toEqual({
      id: "cs_test_mandate",
      url: "https://checkout.stripe.com/c/pay/cs_test_mandate",
      expiresAt: new Date(1_800_000_000_000),
    });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers).toMatchObject({
      "Stripe-Account": "acct_school_test",
      "Idempotency-Key": "finance-mandate-setup-1",
    });
    const form = new URLSearchParams(String(init.body));
    expect(form.get("mode")).toBe("setup");
    expect(form.get("customer")).toBe("cus_school_payer");
    expect(form.get("allowed_payment_method_types[0]")).toBe("bacs_debit");
    expect(form.get("currency")).toBe("gbp");
    expect(form.has("payment_method_types[0]")).toBe(false);
    expect(form.get("setup_intent_data[usage]")).toBe("off_session");
    expect(form.get("setup_intent_data[metadata][finance_mandate_id]")).toBe(
      "mandate-1",
    );
    expect(form.has("branding_settings[display_name]")).toBe(false);
    expect(form.has("payment_intent_data[application_fee_amount]")).toBe(false);
    expect(form.has("payment_intent_data[transfer_data][destination]")).toBe(
      false,
    );
  });

  it("creates only account-scoped, GBP direct PaymentIntents without platform fees", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        id: "pi_test_debit",
        livemode: false,
        amount: 10_000,
        currency: "gbp",
        customer: "cus_school_payer",
        payment_method: "pm_school_bacs",
        status: "processing",
      }),
    );
    const provider = new StripeFinanceBacsProvider(testConfig, fetcher);

    await expect(
      provider.createDebit({
        stripeAccountId: "acct_school_test",
        customerId: "cus_school_payer",
        paymentMethodId: "pm_school_bacs",
        debitAttemptId: "debit-1",
        instalmentId: "instalment-1",
        amountMinor: 10_000n,
        idempotencyKey: "finance-debit-attempt-1",
      }),
    ).resolves.toEqual({ id: "pi_test_debit", status: "processing" });

    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/payment_intents");
    expect(init.headers).toMatchObject({
      "Stripe-Account": "acct_school_test",
      "Idempotency-Key": "finance-debit-attempt-1",
    });
    const form = new URLSearchParams(String(init.body));
    expect(form.get("amount")).toBe("10000");
    expect(form.get("currency")).toBe("gbp");
    expect(form.get("customer")).toBe("cus_school_payer");
    expect(form.get("payment_method")).toBe("pm_school_bacs");
    expect(form.get("allowed_payment_method_types[0]")).toBe("bacs_debit");
    expect(form.has("payment_method_types[0]")).toBe(false);
    expect(form.get("confirm")).toBe("true");
    expect(form.get("off_session")).toBe("true");
    expect(form.get("metadata[finance_debit_attempt_id]")).toBe("debit-1");
    expect(form.has("application_fee_amount")).toBe(false);
    expect(form.has("transfer_data[destination]")).toBe(false);
    expect(form.has("on_behalf_of")).toBe(false);
  });

  it("rejects a non-Stripe hosted setup URL", async () => {
    const provider = new StripeFinanceBacsProvider(testConfig, async () =>
      stripeResponse({
        id: "cs_test_mandate",
        livemode: false,
        url: "https://attacker.example.test/collect",
        expires_at: 1_800_000_000,
      }),
    );
    await expect(
      provider.createMandateSetupSession({
        stripeAccountId: "acct_school_test",
        stripeCustomerId: "cus_school_payer",
        mandateId: "mandate-1",
        payerAccountId: "payer-1",
        consentVersion: "bacs-2026-01",
        idempotencyKey: "finance-mandate-setup-1",
      }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("fails safely for an amount outside JavaScript's safe integer range", async () => {
    const fetcher = jest.fn();
    const provider = new StripeFinanceBacsProvider(testConfig, fetcher);
    await expect(
      provider.createDebit({
        stripeAccountId: "acct_school_test",
        customerId: "cus_school_payer",
        paymentMethodId: "pm_school_bacs",
        debitAttemptId: "debit-1",
        instalmentId: "instalment-1",
        amountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n,
        idempotencyKey: "finance-debit-attempt-1",
      }),
    ).rejects.toMatchObject<Partial<FinanceStripeBacsProviderError>>({
      retryable: false,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
