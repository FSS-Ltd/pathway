import { StripeFinanceMandateServicingProvider } from "../finance-stripe-mandate-servicing.provider";
import { FinanceStripeMandateServicingError } from "../finance-stripe-mandate-servicing.contracts";

const config = { mode: "test" as const, secretKey: "rk_test_finance_fixture" };
const scope = { stripeAccountId: "acct_school", livemode: false };
const cancel = {
  ...scope,
  paymentMethodId: "pm_bank",
  customerId: "cus_payer",
  idempotencyKey: "cancel-mandate",
};
const expire = {
  ...scope,
  sessionId: "cs_setup",
  customerId: "cus_payer",
  mandateId: "local-mandate",
  idempotencyKey: "expire-mandate",
};
const method = {
  id: "pm_bank",
  object: "payment_method",
  created: 1_800_000_000,
  livemode: false,
  type: "bacs_debit",
  customer: "cus_payer",
  billing_details: { email: "private@example.test" },
  bacs_debit: { fingerprint: "private" },
};
const session = {
  id: "cs_setup",
  object: "checkout.session",
  created: 1_800_000_000,
  livemode: false,
  mode: "setup",
  status: "open",
  customer: "cus_payer",
  metadata: { finance_mandate_id: "local-mandate" },
};
function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

describe("independent Stripe mandate servicing", () => {
  it("reads a mandate without inventing created or copying IP/bank details", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      response({
        id: "mandate_bank",
        object: "mandate",
        livemode: false,
        status: "inactive",
        payment_method: "pm_bank",
        customer_acceptance: {
          accepted_at: 1_800_000_000,
          online: { ip_address: "private", user_agent: "private" },
        },
        payment_method_details: { bacs_debit: { reference: "private" } },
      }),
    );
    expect(
      await new StripeFinanceMandateServicingProvider(config, fetcher).retrieve(
        scope,
        "mandates",
        "mandate_bank",
      ),
    ).toEqual({
      id: "mandate_bank",
      object: "mandate",
      livemode: false,
      status: "inactive",
      payment_method: "pm_bank",
      acceptedAt: 1_800_000_000,
    });
    expect(fetcher).toHaveBeenCalledWith(
      "https://api.stripe.com/v1/mandates/mandate_bank",
      expect.objectContaining({
        method: "GET",
        cache: "no-store",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school",
          "Stripe-Version": "2026-09-30.endive",
        }),
      }),
    );
  });
  it("reads a historical SetupIntent while removing client secrets and expanded payer details", async () => {
    const fetcher = jest.fn().mockResolvedValue(
      response({
        id: "seti_setup",
        object: "setup_intent",
        created: 1_800_000_000,
        livemode: false,
        status: "succeeded",
        customer: { id: "cus_payer", email: "private@example.test" },
        payment_method: "pm_bank",
        mandate: "mandate_bank",
        client_secret: "private",
        metadata: {
          finance_mandate_id: "local-mandate",
          private_note: "private",
        },
      }),
    );
    const result = await new StripeFinanceMandateServicingProvider(
      config,
      fetcher,
    ).retrieve(scope, "setupIntents", "seti_setup");
    expect(result).toMatchObject({
      id: "seti_setup",
      object: "setup_intent",
      customer: "cus_payer",
      mandate: "mandate_bank",
    });
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("verifies customer, type and mode before detaching, using servicing configuration alone", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(response(method))
      .mockResolvedValueOnce(response({ ...method, customer: null }));
    await new StripeFinanceMandateServicingProvider(
      config,
      fetcher,
    ).detachPaymentMethod(cancel);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.stripe.com/v1/payment_methods/pm_bank/detach",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Stripe-Account": "acct_school",
          "Idempotency-Key": "cancel-mandate",
        }),
      }),
    );
  });
  it("recognises an already detached method without sending another cancellation", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(response({ ...method, customer: null }));
    await new StripeFinanceMandateServicingProvider(
      config,
      fetcher,
    ).detachPaymentMethod(cancel);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { customer: "cus_other" },
    { type: "card" },
    { livemode: true },
    { id: "pm_other" },
  ])(
    "does not cancel an incompatible or mismatched payment method",
    async (override) => {
      const fetcher = jest
        .fn()
        .mockResolvedValue(response({ ...method, ...override }));
      await expect(
        new StripeFinanceMandateServicingProvider(
          config,
          fetcher,
        ).detachPaymentMethod(cancel),
      ).rejects.toThrow(FinanceStripeMandateServicingError);
      expect(
        fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(0);
    },
  );
  it("expires only the verified open setup session", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValueOnce(response(session))
      .mockResolvedValueOnce(response({ ...session, status: "expired" }));
    await new StripeFinanceMandateServicingProvider(
      config,
      fetcher,
    ).expireMandateSetupSession(expire);
    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      "https://api.stripe.com/v1/checkout/sessions/cs_setup/expire",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": "expire-mandate",
        }),
      }),
    );
  });
  it("does not expire a session that already expired", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(response({ ...session, status: "expired" }));
    await new StripeFinanceMandateServicingProvider(
      config,
      fetcher,
    ).expireMandateSetupSession(expire);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    { status: "complete" },
    { mode: "payment" },
    { customer: "cus_other" },
    { metadata: { finance_mandate_id: "other-mandate" } },
  ])(
    "does not expire a completed or incompatible session",
    async (override) => {
      const fetcher = jest
        .fn()
        .mockResolvedValue(response({ ...session, ...override }));
      await expect(
        new StripeFinanceMandateServicingProvider(
          config,
          fetcher,
        ).expireMandateSetupSession(expire),
      ).rejects.toThrow();
      expect(
        fetcher.mock.calls.filter(([, init]) => init?.method === "POST"),
      ).toHaveLength(0);
    },
  );
  it.each([
    { ...scope, livemode: true },
    { ...scope, stripeAccountId: "acct_other/escape" },
  ])(
    "rejects operation scope mismatch before provider I/O",
    async (invalid) => {
      const fetcher = jest.fn<
        ReturnType<typeof fetch>,
        Parameters<typeof fetch>
      >();
      await expect(
        new StripeFinanceMandateServicingProvider(config, fetcher).retrieve(
          invalid,
          "mandates",
          "mandate_bank",
        ),
      ).rejects.toThrow();
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
  it("rejects mode/key mismatch before provider I/O", async () => {
    const fetcher = jest.fn<
      ReturnType<typeof fetch>,
      Parameters<typeof fetch>
    >();
    await expect(
      new StripeFinanceMandateServicingProvider(
        { mode: "test", secretKey: "sk_live_wrong" },
        fetcher,
      ).retrieve(scope, "mandates", "mandate_bank"),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("preserves missing objects as an explicit retrieval failure", async () => {
    const fetcher = jest
      .fn()
      .mockResolvedValue(response({ error: { message: "private" } }, 404));
    await expect(
      new StripeFinanceMandateServicingProvider(config, fetcher).retrieve(
        scope,
        "mandates",
        "mandate_bank",
      ),
    ).rejects.toMatchObject({ reason: "NOT_FOUND" });
  });
});
