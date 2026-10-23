import { projectFinanceProviderEvent } from "../finance-provider-event.projection";

const scope = { stripeAccountId: "acct_school", livemode: false };
const created = 1_800_000_000;
function event(type: string, object: object) {
  return {
    id: "evt_original",
    object: "event",
    created,
    type,
    account: scope.stripeAccountId,
    livemode: false,
    data: { object },
    request: { idempotency_key: "private-operation-key" },
  };
}
const refund = {
  id: "re_original",
  object: "refund",
  amount: 1000,
  currency: "gbp",
  status: "succeeded",
  charge: "py_payment",
  payment_intent: "pi_payment",
  metadata: null,
};
const debit = {
  id: "pi_debit",
  object: "payment_intent",
  created,
  livemode: false,
  amount: 2450,
  currency: "gbp",
  status: "succeeded",
  customer: { id: "cus_payer", email: "private@example.test" },
  payment_method: { id: "pm_bank", billing_details: { name: "Private payer" } },
  metadata: {
    finance_debit_attempt_id: "attempt",
    finance_instalment_id: "instalment",
    private_note: "private-note",
  },
  client_secret: "private-client-secret",
};

describe("minimal original-provider event projection", () => {
  it("observes hosted setup Checkout without treating the mandate as a payment", () => {
    expect(
      projectFinanceProviderEvent(
        scope,
        event("checkout.session.completed", {
          id: "cs_setup",
          object: "checkout.session",
          mode: "setup",
          status: "complete",
          customer_details: { email: "private@example.test" },
        }),
      )?.disposition,
    ).toBe("observed");
  });
  it.each([
    ["checkout.session.expired", "complete", "paid"],
    ["checkout.session.async_payment_failed", "complete", "paid"],
  ])(
    "holds contradictory Checkout evidence for %s",
    (type, status, paymentStatus) => {
      expect(
        projectFinanceProviderEvent(
          scope,
          event(type, {
            id: "cs_checkout",
            object: "checkout.session",
            created,
            livemode: false,
            mode: "payment",
            status,
            payment_status: paymentStatus,
            amount_total: 2450,
            currency: "gbp",
            client_reference_id: "attempt",
            payment_intent: "pi_checkout",
            expires_at: created + 3600,
            metadata: {
              finance_checkout_attempt_id: "attempt",
              finance_invoice_id: "invoice",
            },
          }),
        )?.disposition,
      ).toBe("hold");
    },
  );
  it.each(["refund.created", "refund.updated", "charge.refund.updated"])(
    "retains original identity, type and time for %s",
    (type) => {
      expect(projectFinanceProviderEvent(scope, event(type, refund))).toEqual({
        id: "evt_original",
        created,
        eventType: type,
        disposition: "queue",
        object: { ...refund, metadata: {} },
      });
    },
  );
  it("uses the original event's dispute movement without inventing a second movement from its current status", () => {
    const projected = projectFinanceProviderEvent(
      scope,
      event("charge.dispute.funds_reinstated", {
        id: "du_original",
        object: "dispute",
        amount: 1000,
        currency: "gbp",
        charge: "py_payment",
        payment_intent: "pi_payment",
        status: "won",
        evidence: { customer_email_address: "private@example.test" },
      }),
    );
    expect(projected).toMatchObject({
      eventType: "charge.dispute.funds_reinstated",
      disposition: "queue",
      object: { id: "du_original", amount: 1000 },
    });
    expect(JSON.stringify(projected)).not.toContain("private");
    expect(projected?.object).not.toHaveProperty("balance_transactions");
  });
  it.each([
    ["succeeded", "payment_intent.succeeded"],
    ["processing", "payment_intent.processing"],
    ["requires_payment_method", "payment_intent.payment_failed"],
    ["canceled", "payment_intent.canceled"],
  ])(
    "projects %s Bacs evidence with only canonical operation fields",
    (status, type) => {
      const projected = projectFinanceProviderEvent(
        scope,
        event(type, { ...debit, status }),
      );
      expect(projected?.disposition).toBe("queue");
      expect(projected?.object).toMatchObject({
        id: "pi_debit",
        customer: "cus_payer",
        payment_method: "pm_bank",
        metadata: {
          finance_debit_attempt_id: "attempt",
          finance_instalment_id: "instalment",
        },
      });
      expect(JSON.stringify(projected)).not.toContain("private");
    },
  );
  it("holds contradictory payment status rather than recording success", () => {
    expect(
      projectFinanceProviderEvent(
        scope,
        event("payment_intent.succeeded", { ...debit, status: "processing" }),
      )?.disposition,
    ).toBe("hold");
  });
  it("holds a card or unknown PaymentIntent for scoped Checkout matching", () => {
    expect(
      projectFinanceProviderEvent(
        scope,
        event("payment_intent.succeeded", { ...debit, metadata: {} }),
      )?.disposition,
    ).toBe("hold");
    expect(
      projectFinanceProviderEvent(
        scope,
        event("payment_intent.succeeded", { ...debit, metadata: {} }),
      )?.object,
    ).toMatchObject({
      id: "pi_debit",
      amount: 2450,
      currency: "gbp",
      status: "succeeded",
    });
  });

  it("holds a refund failure event that contradicts its successful object status", () => {
    expect(
      projectFinanceProviderEvent(scope, event("refund.failed", refund))
        ?.disposition,
    ).toBe("hold");
  });
  it("removes payer details from hosted setup evidence", () => {
    const projected = projectFinanceProviderEvent(
      scope,
      event("setup_intent.succeeded", {
        id: "seti_setup",
        object: "setup_intent",
        status: "succeeded",
        customer: "cus_payer",
        payment_method: "pm_bank",
        mandate: "mandate_bank",
        metadata: {
          finance_mandate_id: "mandate",
          finance_payer_account_id: "payer",
          finance_consent_version: "v1",
          private_note: "private",
        },
        client_secret: "private",
      }),
    );
    expect(projected?.disposition).toBe("queue");
    expect(projected?.object).toHaveProperty("mandate", "mandate_bank");
    expect(JSON.stringify(projected)).not.toContain("private");
  });
  it("retains only the account identity for status refresh", () => {
    expect(
      projectFinanceProviderEvent(
        scope,
        event("account.updated", {
          id: "acct_school",
          object: "account",
          email: "private@example.test",
        }),
      )?.object,
    ).toEqual({ id: "acct_school", object: "account" });
  });
  it("does not store unrelated customer data", () => {
    const projected = projectFinanceProviderEvent(
      scope,
      event("customer.created", {
        id: "cus_payer",
        object: "customer",
        email: "private@example.test",
      }),
    );
    expect(projected?.disposition).toBe("observed");
    expect(JSON.stringify(projected)).not.toContain("private");
  });
  it.each([{ account: "acct_other" }, { livemode: true }, { id: "re_wrong" }])(
    "rejects original event identity or scope mismatch",
    (override) => {
      expect(
        projectFinanceProviderEvent(scope, {
          ...event("refund.updated", refund),
          ...override,
        }),
      ).toBeNull();
    },
  );
});
