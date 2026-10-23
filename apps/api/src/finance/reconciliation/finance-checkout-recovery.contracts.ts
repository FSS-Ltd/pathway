import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import { z } from "zod";

const reference = z
  .string()
  .regex(/^pi_[A-Za-z0-9_]+$/)
  .max(255);
const timestamp = z.number().int().positive().max(8_640_000_000_000);
const operationId = z.string().min(1).max(128);
const checkoutSchema = z
  .object({
    id: z
      .string()
      .regex(/^cs_[A-Za-z0-9_]+$/)
      .max(255),
    object: z.literal("checkout.session"),
    created: timestamp,
    livemode: z.boolean(),
    mode: z.literal("payment"),
    status: z.enum(["open", "complete", "expired"]),
    payment_status: z.enum(["paid", "unpaid", "no_payment_required"]),
    amount_total: z.number().int().safe().nonnegative(),
    currency: z.string().regex(/^[A-Za-z]{3}$/),
    client_reference_id: operationId
      .nullish()
      .transform((value) => value ?? null),
    payment_intent: z
      .union([reference, z.object({ id: reference })])
      .nullish()
      .transform((value) =>
        typeof value === "string" ? value : (value?.id ?? null),
      ),
    expires_at: timestamp,
    metadata: z
      .object({
        finance_checkout_attempt_id: operationId.optional(),
        finance_invoice_id: operationId.optional(),
      })
      .nullish()
      .transform((value) => value ?? {}),
  })
  .refine(
    (value) =>
      value.payment_status !== "paid" ||
      (value.status === "complete" && !!value.payment_intent),
  );

export interface FinanceRecoveredCheckout {
  id: string;
  object: "checkout.session";
  created: number;
  livemode: boolean;
  mode: "payment";
  status: "open" | "complete" | "expired";
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number;
  currency: string;
  client_reference_id: string | null;
  payment_intent: string | null;
  expires_at: number;
  metadata: {
    finance_checkout_attempt_id?: string;
    finance_invoice_id?: string;
  };
}

export interface FinanceCheckoutRecoveryAttempt {
  id: string;
  invoiceId: string;
  stripeConnectionId: string;
  tenantId: string;
  orgId: string;
  stripeAccountId: string;
  livemode: boolean;
  amountMinor: bigint;
  currency: string;
  stripeCheckoutSessionId: string | null;
  stripePaymentIntentId: string | null;
}

export function projectFinanceCheckout(
  value: unknown,
): FinanceRecoveredCheckout | null {
  const parsed = checkoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function checkoutRecoveryMismatch(
  scope: FinanceConnectionScope,
  attempt: FinanceCheckoutRecoveryAttempt,
  checkout: FinanceRecoveredCheckout,
):
  | "SCOPE_MISMATCH"
  | "OPERATION_MISMATCH"
  | "MONEY_MISMATCH"
  | "DUPLICATE_SESSION"
  | "PAYMENT_MISMATCH"
  | null {
  if (
    attempt.tenantId !== scope.tenantId ||
    attempt.orgId !== scope.orgId ||
    attempt.stripeConnectionId !== scope.connectionId ||
    attempt.stripeAccountId !== scope.stripeAccountId ||
    attempt.livemode !== scope.livemode ||
    checkout.livemode !== scope.livemode
  )
    return "SCOPE_MISMATCH";
  if (
    checkout.client_reference_id !== attempt.id ||
    checkout.metadata.finance_checkout_attempt_id !== attempt.id ||
    checkout.metadata.finance_invoice_id !== attempt.invoiceId
  )
    return "OPERATION_MISMATCH";
  if (
    BigInt(checkout.amount_total) !== attempt.amountMinor ||
    checkout.currency.toUpperCase() !== attempt.currency
  )
    return "MONEY_MISMATCH";
  if (
    attempt.stripeCheckoutSessionId &&
    attempt.stripeCheckoutSessionId !== checkout.id
  )
    return "DUPLICATE_SESSION";
  if (
    attempt.stripePaymentIntentId &&
    checkout.payment_intent &&
    attempt.stripePaymentIntentId !== checkout.payment_intent
  )
    return "PAYMENT_MISMATCH";
  return null;
}
