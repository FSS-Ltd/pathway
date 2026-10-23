import {
  checkoutRecoveryMismatch,
  projectFinanceCheckout,
  type FinanceCheckoutRecoveryAttempt,
  type FinanceRecoveredCheckout,
} from "../finance-checkout-recovery.contracts";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";

const scope: FinanceConnectionScope = {
  connectionId: "connection",
  tenantId: "tenant",
  orgId: "org",
  stripeAccountId: "acct_school",
  livemode: false,
};
const attempt: FinanceCheckoutRecoveryAttempt = {
  id: "attempt",
  invoiceId: "invoice",
  stripeConnectionId: scope.connectionId,
  tenantId: scope.tenantId,
  orgId: scope.orgId,
  stripeAccountId: scope.stripeAccountId,
  livemode: false,
  amountMinor: 2450n,
  currency: "EUR",
  stripeCheckoutSessionId: null,
  stripePaymentIntentId: null,
};
const checkout: FinanceRecoveredCheckout = {
  id: "cs_recovered",
  object: "checkout.session",
  created: 1_800_000_000,
  livemode: false,
  mode: "payment",
  status: "complete",
  payment_status: "paid",
  amount_total: 2450,
  currency: "eur",
  client_reference_id: "attempt",
  payment_intent: "pi_recovered",
  expires_at: 1_800_086_400,
  metadata: {
    finance_checkout_attempt_id: "attempt",
    finance_invoice_id: "invoice",
  },
};

describe("Finance Checkout recovery contract", () => {
  it("projects only the payment facts needed by canonical replay", () => {
    expect(
      projectFinanceCheckout({
        ...checkout,
        customer_details: { email: "private@example.test" },
        client_secret: "fixture-secret",
        url: "https://checkout.stripe.com/secret",
        metadata: { ...checkout.metadata, private_note: "Do not persist" },
      }),
    ).toEqual(checkout);
  });

  it("normalizes an expanded PaymentIntent without keeping its client secret", () => {
    expect(
      projectFinanceCheckout({
        ...checkout,
        payment_intent: { id: "pi_recovered", client_secret: "fixture-secret" },
      })?.payment_intent,
    ).toBe("pi_recovered");
  });

  it.each([
    { amount_total: 2 ** 53 },
    { amount_total: -1 },
    { mode: "setup" },
    { payment_intent: "seti_wrong" },
    { currency: "euro" },
  ])("rejects malformed or non-payment Checkout data", (override) => {
    expect(projectFinanceCheckout({ ...checkout, ...override })).toBeNull();
  });

  it("matches a lost identifier using every stored operation fact", () => {
    expect(checkoutRecoveryMismatch(scope, attempt, checkout)).toBeNull();
  });

  it.each([
    { tenantId: "other" },
    { orgId: "other" },
    { stripeConnectionId: "other" },
    { stripeAccountId: "acct_other" },
    { livemode: true },
  ])("rejects a forged operation scope", (override) => {
    expect(
      checkoutRecoveryMismatch(scope, { ...attempt, ...override }, checkout),
    ).toBe("SCOPE_MISMATCH");
  });

  it.each([
    { client_reference_id: "other" },
    {
      metadata: { ...checkout.metadata, finance_checkout_attempt_id: "other" },
    },
    { metadata: { ...checkout.metadata, finance_invoice_id: "other" } },
  ])(
    "does not infer ownership from incomplete or mismatched metadata",
    (override) => {
      expect(
        checkoutRecoveryMismatch(scope, attempt, { ...checkout, ...override }),
      ).toBe("OPERATION_MISMATCH");
    },
  );

  it.each([{ amount_total: 2451 }, { currency: "gbp" }])(
    "rejects a different obligation amount or currency",
    (override) => {
      expect(
        checkoutRecoveryMismatch(scope, attempt, { ...checkout, ...override }),
      ).toBe("MONEY_MISMATCH");
    },
  );

  it("preserves a previously linked session and PaymentIntent", () => {
    expect(
      checkoutRecoveryMismatch(
        scope,
        { ...attempt, stripeCheckoutSessionId: "cs_other" },
        checkout,
      ),
    ).toBe("DUPLICATE_SESSION");
    expect(
      checkoutRecoveryMismatch(
        scope,
        { ...attempt, stripePaymentIntentId: "pi_other" },
        checkout,
      ),
    ).toBe("PAYMENT_MISMATCH");
  });

  it("does not accept another environment's object", () => {
    expect(
      checkoutRecoveryMismatch(scope, attempt, { ...checkout, livemode: true }),
    ).toBe("SCOPE_MISMATCH");
  });
});
