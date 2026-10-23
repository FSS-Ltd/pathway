import type { Prisma } from "@pathway/db";
import {
  mandateSchema,
  paymentIntentSchema,
  paymentMethodSchema,
  setupIntentSchema,
} from "../stripe/finance-stripe-bacs-webhook.contracts";

const paymentStatuses: Readonly<Record<string, string>> = {
  "payment_intent.processing": "processing",
  "payment_intent.succeeded": "succeeded",
  "payment_intent.payment_failed": "requires_payment_method",
  "payment_intent.canceled": "canceled",
};

function reference(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

export function isFinanceBacsObservationType(type: string): boolean {
  return (
    Object.hasOwn(paymentStatuses, type) ||
    type === "setup_intent.succeeded" ||
    type === "setup_intent.setup_failed" ||
    type === "mandate.updated" ||
    type === "payment_method.detached"
  );
}

/** Shares the canonical parser's schemas, then removes expanded customer/bank data. */
export function projectFinanceBacsObject(
  type: string,
  value: unknown,
): Prisma.InputJsonObject | null {
  if (Object.hasOwn(paymentStatuses, type)) {
    const parsed = paymentIntentSchema.safeParse(value);
    if (
      !parsed.success ||
      parsed.data.status !== paymentStatuses[type] ||
      !Number.isSafeInteger(parsed.data.amount)
    )
      return null;
    const object = parsed.data;
    return {
      id: object.id,
      object: object.object,
      status: object.status,
      amount: object.amount,
      currency: object.currency,
      customer: reference(object.customer),
      payment_method: reference(object.payment_method),
      metadata: {
        finance_debit_attempt_id: object.metadata.finance_debit_attempt_id,
        finance_instalment_id: object.metadata.finance_instalment_id,
      },
    };
  }
  if (
    type === "setup_intent.succeeded" ||
    type === "setup_intent.setup_failed"
  ) {
    const parsed = setupIntentSchema.safeParse(value);
    if (!parsed.success) return null;
    const object = parsed.data;
    const success = type === "setup_intent.succeeded";
    const customer = reference(object.customer);
    const paymentMethod = reference(object.payment_method);
    const mandate = reference(object.mandate);
    if (
      success
        ? object.status !== "succeeded" ||
          !customer ||
          !paymentMethod ||
          !mandate
        : object.status === "succeeded"
    )
      return null;
    return {
      id: object.id,
      object: object.object,
      status: object.status,
      customer,
      payment_method: paymentMethod,
      mandate,
      metadata: {
        finance_mandate_id: object.metadata.finance_mandate_id,
        finance_payer_account_id: object.metadata.finance_payer_account_id,
        finance_consent_version: object.metadata.finance_consent_version,
      },
    };
  }
  if (type === "mandate.updated") {
    const parsed = mandateSchema.safeParse(value);
    if (!parsed.success) return null;
    return {
      id: parsed.data.id,
      object: parsed.data.object,
      status: parsed.data.status,
      customer: reference(parsed.data.customer),
      payment_method: reference(parsed.data.payment_method),
    };
  }
  if (type === "payment_method.detached") {
    const parsed = paymentMethodSchema.safeParse(value);
    return parsed.success
      ? {
          id: parsed.data.id,
          object: parsed.data.object,
          customer: reference(parsed.data.customer),
        }
      : null;
  }
  return null;
}
