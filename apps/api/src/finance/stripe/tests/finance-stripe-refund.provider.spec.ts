import type { FinanceStripeCheckoutConfig } from "../finance-stripe-checkout.config";
import {
  FinanceStripeRefundProviderError,
  StripeFinanceRefundProvider,
} from "../finance-stripe-refund.provider";

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

describe("StripeFinanceRefundProvider", () => {
  it("retrieves the PaymentIntent of a non-card py_ charge in its connected account", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        id: "py_bacs_payment",
        object: "charge",
        payment_intent: "pi_bacs_payment",
      }),
    );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);
    expect(
      await provider.retrieveChargePaymentIntent({
        stripeAccountId: "acct_school_test",
        chargeId: "py_bacs_payment",
      }),
    ).toBe("pi_bacs_payment");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/charges/py_bacs_payment",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school_test",
        }),
      }),
    );
  });
  it("never posts an unknown refund beyond the permitted retry window", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(stripeResponse({ data: [], has_more: false }));
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);
    await expect(
      provider.createRefund({
        creationPermitted: false,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-unknown",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("recovers a matching old refund without posting another refund", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        data: [
          {
            id: "re_recovered",
            amount: 2450,
            currency: "eur",
            status: "succeeded",
            created: 1_800_000_000,
            livemode: false,
            metadata: { finance_refund_id: "refund-unknown" },
          },
        ],
        has_more: false,
      }),
    );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);
    expect(
      await provider.createRefund({
        creationPermitted: false,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-unknown",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).toMatchObject({ id: "re_recovered", status: "succeeded" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("stops repeated refund pagination without creating a refund", async () => {
    const page = {
      data: [
        {
          id: "re_repeat",
          amount: 2450,
          currency: "eur",
          status: "succeeded",
          created: 1_800_000_000,
          livemode: false,
          metadata: {},
        },
      ],
      has_more: true,
    };
    const fetcher = jest
      .fn()
      .mockRejectedValue(new Error("Fixture pagination exceeded"))
      .mockResolvedValueOnce(stripeResponse(page))
      .mockResolvedValueOnce(stripeResponse(page));
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);
    await expect(
      provider.createRefund({
        creationPermitted: true,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-unknown",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(
      fetcher.mock.calls.every(([, request]) => request.method === "GET"),
    ).toBe(true);
  });
  it("creates an idempotent refund in the connected school's account", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(stripeResponse({ data: [], has_more: false }))
      .mockResolvedValueOnce(
        stripeResponse({
          id: "re_finance_refund_1",
          amount: 2450,
          currency: "eur",
          status: "succeeded",
          created: 1_800_000_000,
          livemode: false,
          metadata: { finance_refund_id: "refund-1" },
        }),
      );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);

    await expect(
      provider.createRefund({
        creationPermitted: true,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-1",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).resolves.toEqual({
      id: "re_finance_refund_1",
      amountMinor: 2450n,
      currency: "EUR",
      status: "succeeded",
      createdAt: new Date(1_800_000_000_000),
    });

    const [lookupUrl, lookupInit] = fetcher.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(lookupUrl).toBe(
      "https://api.stripe.com/v1/refunds?payment_intent=pi_school_payment_1&limit=100",
    );
    expect(lookupInit).toMatchObject({
      method: "GET",
      headers: { "Stripe-Account": "acct_school_test" },
    });

    const [url, init] = fetcher.mock.calls[1] as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/refunds");
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: `Bearer ${testConfig.secretKey}`,
        "Stripe-Account": "acct_school_test",
        "Idempotency-Key": "finance-refund-refund-1",
      },
    });
    const form = new URLSearchParams(String(init.body));
    expect(form.get("payment_intent")).toBe("pi_school_payment_1");
    expect(form.get("amount")).toBe("2450");
    expect(form.get("metadata[finance_refund_id]")).toBe("refund-1");
    expect(form.has("reverse_transfer")).toBe(false);
    expect(form.has("refund_application_fee")).toBe(false);
  });

  it("recovers an existing refund before posting again", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(
        stripeResponse({
          data: [
            {
              id: "re_finance_refund_unrelated",
              amount: 100,
              currency: "eur",
              status: "succeeded",
              created: 1_798_000_000,
              livemode: false,
              metadata: {},
            },
          ],
          has_more: true,
        }),
      )
      .mockResolvedValueOnce(
        stripeResponse({
          data: [
            {
              id: "re_finance_refund_existing",
              amount: 2450,
              currency: "eur",
              status: "succeeded",
              created: 1_799_000_000,
              livemode: false,
              metadata: { finance_refund_id: "refund-1" },
            },
          ],
          has_more: false,
        }),
      );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);

    await expect(
      provider.createRefund({
        creationPermitted: true,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-1",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).resolves.toMatchObject({
      id: "re_finance_refund_existing",
      amountMinor: 2450n,
      currency: "EUR",
      status: "succeeded",
      createdAt: new Date(1_799_000_000_000),
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain(
      "starting_after=re_finance_refund_unrelated",
    );
  });

  it("continues recovery when Stripe returns a refund with null metadata", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        data: [
          {
            id: "re_finance_refund_unrelated",
            amount: 100,
            currency: "eur",
            status: "succeeded",
            created: 1_798_000_000,
            livemode: false,
            metadata: null,
          },
          {
            id: "re_finance_refund_existing",
            amount: 2450,
            currency: "eur",
            status: "succeeded",
            created: 1_799_000_000,
            livemode: false,
            metadata: { finance_refund_id: "refund-1" },
          },
        ],
        has_more: false,
      }),
    );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);

    await expect(
      provider.createRefund({
        creationPermitted: true,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-1",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).resolves.toMatchObject({
      id: "re_finance_refund_existing",
      amountMinor: 2450n,
      currency: "EUR",
      status: "succeeded",
      createdAt: new Date(1_799_000_000_000),
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("looks up a charge's PaymentIntent within its connected account", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      stripeResponse({
        id: "ch_school_payment_1",
        object: "charge",
        payment_intent: { id: "pi_school_payment_1" },
      }),
    );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);

    await expect(
      provider.retrieveChargePaymentIntent({
        stripeAccountId: "acct_school_test",
        chargeId: "ch_school_payment_1",
      }),
    ).resolves.toBe("pi_school_payment_1");
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/charges/ch_school_payment_1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school_test",
        }),
      }),
    );
  });

  it("treats mismatched or incomplete provider evidence as retryable", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(stripeResponse({ data: [], has_more: false }))
      .mockResolvedValueOnce(
        stripeResponse({
          id: "re_wrong_refund",
          amount: 2500,
          currency: "eur",
          status: "succeeded",
          created: 1_800_000_000,
          livemode: false,
          metadata: { finance_refund_id: "refund-1" },
        }),
      );
    const provider = new StripeFinanceRefundProvider(testConfig, fetcher);

    await expect(
      provider.createRefund({
        creationPermitted: true,
        stripeAccountId: "acct_school_test",
        paymentIntentId: "pi_school_payment_1",
        refundId: "refund-1",
        amountMinor: 2450n,
        currency: "EUR",
      }),
    ).rejects.toMatchObject<Partial<FinanceStripeRefundProviderError>>({
      retryable: true,
    });
  });
});
