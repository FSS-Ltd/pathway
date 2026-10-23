import { z } from "zod";
import type { FinanceReconciliationScope } from "../stripe/finance-stripe-reconciliation.provider";

const identifier = z
  .string()
  .max(255)
  .regex(/^[A-Za-z0-9_]+$/);
const reference = z
  .union([
    identifier,
    z.object({ id: identifier }).transform((value) => value.id),
  ])
  .nullable();
const minor = z.number().int().safe();
const timestamp = z.number().int().safe().nonnegative();
const currency = z
  .string()
  .regex(/^[A-Za-z]{3}$/)
  .transform((value) => value.toUpperCase());
const base = z.object({
  id: identifier,
  created: timestamp,
  livemode: z.boolean().optional(),
  account: identifier.nullable().optional(),
});
const chargeSchema = base.extend({
  object: z.literal("charge"),
  id: identifier.regex(/^(ch|py)_/),
  livemode: z.boolean(),
  amount: minor.nonnegative(),
  currency,
  paid: z.boolean(),
  captured: z.boolean(),
  status: z.enum(["succeeded", "pending", "failed"]),
  payment_intent: reference,
  balance_transaction: reference,
});
const balanceSchema = base.extend({
  object: z.literal("balance_transaction"),
  id: identifier.regex(/^txn_/),
  amount: minor,
  fee: minor,
  net: minor,
  currency,
  type: z.string().min(1).max(64),
  status: z.enum(["available", "pending"]),
  available_on: timestamp,
  source: reference,
  fee_details: z
    .array(
      z.object({ amount: minor, currency, type: z.string().min(1).max(64) }),
    )
    .max(100)
    .optional(),
});
const payoutSchema = base.extend({
  object: z.literal("payout"),
  id: identifier.regex(/^po_/),
  livemode: z.boolean(),
  amount: minor.nonnegative(),
  currency,
  automatic: z.boolean(),
  status: z.enum(["paid", "pending", "in_transit", "canceled", "failed"]),
  arrival_date: timestamp,
  balance_transaction: reference,
});

export type FinanceChargeProjection = z.infer<typeof chargeSchema>;
export type FinanceBalanceTransactionProjection = z.infer<typeof balanceSchema>;
export type FinancePayoutProjection = z.infer<typeof payoutSchema>;

function scoped<T extends { livemode?: boolean; account?: string | null }>(
  scope: FinanceReconciliationScope,
  row: T,
): Omit<T, "account"> {
  if (
    (row.livemode !== undefined && row.livemode !== scope.livemode) ||
    (row.account != null && row.account !== scope.stripeAccountId)
  )
    throw new Error("Settlement provider scope is invalid");
  const facts = { ...row };
  delete facts.account;
  return facts;
}

/** Charge reads never confirm payment or write a family receipt. */
export function projectFinanceCharge(
  scope: FinanceReconciliationScope,
  value: unknown,
): Omit<FinanceChargeProjection, "account"> {
  return scoped(scope, chargeSchema.parse(value));
}

export function projectFinanceBalanceTransaction(
  scope: FinanceReconciliationScope,
  value: unknown,
): Omit<FinanceBalanceTransactionProjection, "account"> {
  const row = balanceSchema.parse(value);
  if (BigInt(row.amount) - BigInt(row.fee) !== BigInt(row.net))
    throw new Error("Settlement balance arithmetic is invalid");
  if (
    row.fee_details &&
    row.fee_details.some((fee) => fee.currency !== row.currency)
  )
    throw new Error("Settlement fee currency is invalid");
  if (
    row.fee_details &&
    row.fee_details.reduce((sum, fee) => sum + BigInt(fee.amount), 0n) !==
      BigInt(row.fee)
  )
    throw new Error("Settlement fee detail arithmetic is invalid");
  return scoped(scope, row);
}

export function projectFinancePayout(
  scope: FinanceReconciliationScope,
  value: unknown,
): Omit<FinancePayoutProjection, "account"> {
  return scoped(scope, payoutSchema.parse(value));
}
