import type { FinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";
import {
  FinanceStripeCheckoutProviderError,
  financeCheckoutIntegrationIdentifier,
  StripeFinanceCheckoutProvider,
} from "../finance-stripe-checkout.provider";

const testConfig: FinanceStripeCheckoutConfig = {
  mode: "test",
  secretKey: "sk_test_finance_fixture",
  webAppUrl: "https://family.example.test",
};

function stripeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("StripeFinanceCheckoutProvider", () => {
  it.each([29n, 100_000_000n])(
    "rejects unsupported card amount %s permanently before I/O",
    async (amountMinor) => {
      const fetcher = jest.fn();
      const provider = new StripeFinanceCheckoutProvider(testConfig, fetcher);
      await expect(
        provider.createSession({
          stripeAccountId: "acct_school_test",
          attemptId: "attempt-1",
          invoiceId: "invoice-1",
          invoiceNumber: "1001",
          amountMinor,
          currency: "GBP",
          idempotencyKey: "finance-checkout-attempt-1",
          integrationIdentifier: "nexsteps-finance-abcdefgh",
          expiresAt: new Date(Date.now() + 3_600_000),
        }),
      ).rejects.toMatchObject({ status: 422 });
      expect(fetcher).not.toHaveBeenCalled();
    },
  );

  it("creates an account-scoped one-time Checkout Session without shared customers or platform fees", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        id: "cs_test_finance_1",
        livemode: false,
        url: "https://checkout.stripe.com/c/pay/cs_test_finance_1",
        expires_at: 1_800_000_000,
      }),
    );
    const provider = new StripeFinanceCheckoutProvider(testConfig, fetcher);
    const session = await provider.createSession({
      stripeAccountId: "acct_school_test",
      attemptId: "attempt-1",
      invoiceId: "invoice-1",
      invoiceNumber: "1001",
      amountMinor: 12_500n,
      currency: "EUR",
      idempotencyKey: "finance-checkout-attempt-1",
      integrationIdentifier: "nexsteps-finance-abcdefgh",
      expiresAt: new Date(1_800_000_000_000),
    });

    expect(session).toEqual({
      id: "cs_test_finance_1",
      url: "https://checkout.stripe.com/c/pay/cs_test_finance_1",
      expiresAt: new Date(1_800_000_000_000),
    });
    const [url, init] = fetcher.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect(init.headers).toMatchObject({
      "Stripe-Account": "acct_school_test",
      "Idempotency-Key": "finance-checkout-attempt-1",
    });
    const form = new URLSearchParams(String(init.body));
    expect(form.get("mode")).toBe("payment");
    expect(form.get("line_items[0][price_data][currency]")).toBe("eur");
    expect(form.get("line_items[0][price_data][unit_amount]")).toBe("12500");
    expect(form.get("allowed_payment_method_types[0]")).toBe("card");
    expect(form.get("client_reference_id")).toBe("attempt-1");
    expect(form.get("metadata[finance_invoice_id]")).toBe("invoice-1");
    expect(form.get("success_url")).toContain("{CHECKOUT_SESSION_ID}");
    expect(form.has("customer")).toBe(false);
    expect(form.has("customer_email")).toBe(false);
    expect(form.has("payment_intent_data[application_fee_amount]")).toBe(false);
    expect(form.has("payment_intent_data[transfer_data][destination]")).toBe(
      false,
    );
    expect(form.has("on_behalf_of")).toBe(false);
  });

  it("keeps network timeouts retryable so the caller can reuse its idempotency key", async () => {
    const provider = new StripeFinanceCheckoutProvider(testConfig, async () => {
      throw new Error("network timeout");
    });
    await expect(
      provider.createSession({
        stripeAccountId: "acct_school_test",
        attemptId: "attempt-1",
        invoiceId: "invoice-1",
        invoiceNumber: "1001",
        amountMinor: 30n,
        currency: "GBP",
        idempotencyKey: "finance-checkout-attempt-1",
        integrationIdentifier: "nexsteps-finance-abcdefgh",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      }),
    ).rejects.toMatchObject<Partial<FinanceStripeCheckoutProviderError>>({
      retryable: true,
    });
  });

  it("rejects a Checkout URL outside Stripe's hosted Checkout domain", async () => {
    const provider = new StripeFinanceCheckoutProvider(testConfig, async () =>
      stripeResponse({
        id: "cs_test_finance_1",
        livemode: false,
        url: "https://attacker.example.test/checkout",
        expires_at: 1_800_000_000,
      }),
    );
    await expect(
      provider.createSession({
        stripeAccountId: "acct_school_test",
        attemptId: "attempt-1",
        invoiceId: "invoice-1",
        invoiceNumber: "1001",
        amountMinor: 30n,
        currency: "GBP",
        idempotencyKey: "finance-checkout-attempt-1",
        integrationIdentifier: "nexsteps-finance-abcdefgh",
        expiresAt: new Date(1_800_000_000_000),
      }),
    ).rejects.toMatchObject({ retryable: true });
  });

  it("retrieves a session in the same connected-account scope without posting a payment", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        status: "complete",
        payment_status: "paid",
        expires_at: 1_800_000_000,
      }),
    );
    const provider = new StripeFinanceCheckoutProvider(testConfig, fetcher);
    await expect(
      provider.retrieveSession({
        stripeAccountId: "acct_school_test",
        sessionId: "cs_test_finance_1",
      }),
    ).resolves.toEqual({ status: "complete", paymentStatus: "paid" });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/checkout/sessions/cs_test_finance_1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school_test",
        }),
      }),
    );
  });

  it("expires a hosted Checkout Session on its connected school account", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(stripeResponse({ status: "expired" }));
    const provider = new StripeFinanceCheckoutProvider(testConfig, fetcher);

    await provider.expireSession({
      stripeAccountId: "acct_school_test",
      sessionId: "cs_test_finance_1",
      idempotencyKey: "finance-checkout-expire-attempt-1",
    });

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/checkout/sessions/cs_test_finance_1/expire",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school_test",
          "Idempotency-Key": "finance-checkout-expire-attempt-1",
        }),
      }),
    );
  });

  it("generates the required eight-letter integration identifier suffix", () => {
    expect(financeCheckoutIntegrationIdentifier()).toMatch(
      /^nexsteps-finance-[a-z]{8}$/,
    );
  });
});
