import type { Prisma } from "@pathway/db";
import { z } from "zod";
import { stripeChargeIdSchema } from "../stripe/finance-stripe-references";

const timestamp = z.number().int().positive().max(8_640_000_000_000);
const money = z.number().int().safe().positive();
const currency = z.string().regex(/^[A-Za-z]{3}$/);
const transactionId = z
  .string()
  .regex(/^txn_[A-Za-z0-9_]+$/)
  .max(255);
const intentId = z
  .string()
  .regex(/^pi_[A-Za-z0-9_]+$/)
  .max(255);

function reference(schema: z.ZodString) {
  return z
    .union([schema, z.object({ id: schema })])
    .nullish()
    .transform((value) =>
      typeof value === "string" ? value : (value?.id ?? null),
    );
}

const refundSchema = z.object({
  id: z
    .string()
    .regex(/^re_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("refund"),
  amount: money,
  currency,
  status: z.enum([
    "pending",
    "requires_action",
    "succeeded",
    "failed",
    "canceled",
  ]),
  payment_intent: reference(intentId),
  charge: reference(stripeChargeIdSchema),
  metadata: z
    .object({ finance_refund_id: z.string().min(1).max(128).optional() })
    .nullish()
    .transform((value) => value ?? {}),
  balance_transaction: reference(transactionId),
  failure_balance_transaction: reference(transactionId),
});
const balanceMovementSchema = z.object({
  id: transactionId,
  object: z.literal("balance_transaction"),
  created: timestamp,
  amount: z.number().int().safe(),
  currency,
});
const disputeSchema = z.object({
  id: z
    .string()
    .regex(/^du_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("dispute"),
  amount: money,
  currency,
  payment_intent: reference(intentId),
  charge: reference(stripeChargeIdSchema),
  balance_transactions: z.array(balanceMovementSchema).max(2),
});

export type FinanceReversalObservation = { object: Prisma.InputJsonObject } & (
  | { eventType: "refund.updated" | "refund.failed"; movement?: never }
  | {
      eventType:
        | "charge.dispute.funds_withdrawn"
        | "charge.dispute.funds_reinstated";
      movement: { id: string; created: number };
    }
);

export type FinanceReversalIssue =
  | "INVALID_REFUND"
  | "INVALID_DISPUTE"
  | "AMBIGUOUS_DISPUTE_MOVEMENTS"
  | "DISPUTE_MOVEMENT_MONEY_MISMATCH"
  | "DISPUTE_MOVEMENT_TIME_MISMATCH";

export type FinanceReversalProjection =
  | { observations: FinanceReversalObservation[]; issue: null }
  | { observations: []; issue: FinanceReversalIssue };

export function projectFinanceRefund(
  value: unknown,
): FinanceReversalProjection {
  const parsed = refundSchema.safeParse(value);
  if (!parsed.success) return { observations: [], issue: "INVALID_REFUND" };
  const { balance_transaction, failure_balance_transaction, ...core } =
    parsed.data;
  return {
    observations: [
      {
        eventType:
          core.status === "failed" || core.status === "canceled"
            ? "refund.failed"
            : "refund.updated",
        object: {
          ...core,
          ...(balance_transaction ? { balance_transaction } : {}),
          ...(failure_balance_transaction
            ? { failure_balance_transaction }
            : {}),
        },
      },
    ],
    issue: null,
  };
}

export function projectFinanceDispute(
  value: unknown,
): FinanceReversalProjection {
  const parsed = disputeSchema.safeParse(value);
  if (!parsed.success) return { observations: [], issue: "INVALID_DISPUTE" };
  const { balance_transactions: movements, ...object } = parsed.data;
  const withdrawals = movements.filter((row) => row.amount < 0);
  const reinstatements = movements.filter((row) => row.amount > 0);
  if (
    withdrawals.length > 1 ||
    reinstatements.length > 1 ||
    (reinstatements.length && !withdrawals.length)
  )
    return { observations: [], issue: "AMBIGUOUS_DISPUTE_MOVEMENTS" };
  if (
    movements.some(
      (row) =>
        row.currency.toUpperCase() !== object.currency.toUpperCase() ||
        (row.amount !== 0 && Math.abs(row.amount) !== object.amount),
    )
  )
    return { observations: [], issue: "DISPUTE_MOVEMENT_MONEY_MISMATCH" };
  const withdrawal = withdrawals[0];
  const reinstatement = reinstatements[0];
  if (withdrawal && reinstatement && reinstatement.created < withdrawal.created)
    return { observations: [], issue: "DISPUTE_MOVEMENT_TIME_MISMATCH" };
  const observations: FinanceReversalObservation[] = [];
  if (withdrawal)
    observations.push({
      eventType: "charge.dispute.funds_withdrawn",
      object,
      movement: { id: withdrawal.id, created: withdrawal.created },
    });
  if (reinstatement)
    observations.push({
      eventType: "charge.dispute.funds_reinstated",
      object,
      movement: { id: reinstatement.id, created: reinstatement.created },
    });
  return { observations, issue: null };
}
