import type { Prisma } from "@pathway/db";
import {
  parseFinanceStripeBacsEvent,
  type FinanceStripeBacsWebhookInput,
} from "../finance-stripe-bacs-webhook.contracts";

function webhookInput(
  eventType: string,
  object: unknown,
  livemode = false,
): FinanceStripeBacsWebhookInput {
  const stripeEventId = `evt_${eventType.replaceAll(".", "_")}`;
  return {
    stripeEventId,
    tenantId: "tenant-1",
    orgId: "org-1",
    stripeAccountId: "acct_school_test",
    eventType,
    livemode,
    payloadJson: {
      id: stripeEventId,
      type: eventType,
      created: 1_800_000_000,
      livemode,
      account: "acct_school_test",
      data: { object },
    } as Prisma.JsonValue,
  };
}

describe("Finance Bacs webhook contracts", () => {
  it("parses a completed hosted Bacs SetupIntent without storing bank details", () => {
    const input = webhookInput("setup_intent.succeeded", {
      id: "seti_school_1",
      object: "setup_intent",
      status: "succeeded",
      customer: "cus_school_1",
      payment_method: "pm_school_1",
      mandate: "mandate_school_1",
      metadata: {
        finance_mandate_id: "mandate-record-1",
        finance_payer_account_id: "payer-1",
        finance_consent_version: "finance-bacs-mandate-2026-01",
      },
    });
    expect(parseFinanceStripeBacsEvent(input)).toMatchObject({
      kind: "setup_succeeded",
      setupIntentId: "seti_school_1",
      customerId: "cus_school_1",
      paymentMethodId: "pm_school_1",
      mandateId: "mandate_school_1",
      financeMandateId: "mandate-record-1",
    });
  });

  it("accepts only the documented terminal Bacs PaymentIntent statuses", () => {
    const input = webhookInput("payment_intent.succeeded", {
      id: "pi_school_1",
      object: "payment_intent",
      status: "succeeded",
      amount: 5_000,
      currency: "gbp",
      customer: "cus_school_1",
      payment_method: "pm_school_1",
      metadata: {
        finance_debit_attempt_id: "debit-1",
        finance_instalment_id: "instalment-1",
      },
    });
    expect(parseFinanceStripeBacsEvent(input)).toMatchObject({
      kind: "payment_intent",
      status: "succeeded",
      paymentIntentId: "pi_school_1",
      amountMinor: 5_000n,
    });
  });

  it("rejects an account mismatch and an unknown provider status", () => {
    const mismatch = webhookInput("payment_intent.processing", {
      id: "pi_school_1",
      object: "payment_intent",
      status: "processing",
      amount: 5_000,
      currency: "gbp",
      customer: "cus_school_1",
      payment_method: "pm_school_1",
      metadata: {
        finance_debit_attempt_id: "debit-1",
        finance_instalment_id: "instalment-1",
      },
    });
    expect(() =>
      parseFinanceStripeBacsEvent({
        ...mismatch,
        stripeAccountId: "acct_another_school",
      }),
    ).toThrow("account does not match");

    const unknown = webhookInput("payment_intent.succeeded", {
      id: "pi_school_1",
      object: "payment_intent",
      status: "future_status",
      amount: 5_000,
      currency: "gbp",
      customer: "cus_school_1",
      payment_method: "pm_school_1",
      metadata: {
        finance_debit_attempt_id: "debit-1",
        finance_instalment_id: "instalment-1",
      },
    });
    expect(() => parseFinanceStripeBacsEvent(unknown)).toThrow(
      "payload is invalid",
    );
  });
});
