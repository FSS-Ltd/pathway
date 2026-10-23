import type { FinanceCurrency } from "@pathway/platform";
import type { Prisma } from "@pathway/db";
import { z } from "zod";
import { stripeChargeIdSchema } from "./finance-stripe-references";

export const refundEventTypes = new Set([
  "refund.created",
  "refund.updated",
  "refund.failed",
  "charge.refund.updated",
]);
export const disputeEventTypes = new Set([
  "charge.dispute.funds_withdrawn",
  "charge.dispute.funds_reinstated",
]);

const stripeIdSchema = z.string().min(1);
const stripePaymentIntentSchema = z
  .union([
    z.string().startsWith("pi_"),
    z.object({ id: z.string().startsWith("pi_") }).passthrough(),
  ])
  .nullable()
  .optional();

export const stripeRefundSchema = z
  .object({
    id: z.string().startsWith("re_"),
    object: z.literal("refund"),
    amount: z.number().int().positive(),
    currency: z.string().length(3),
    status: z.enum([
      "pending",
      "requires_action",
      "succeeded",
      "failed",
      "canceled",
    ]),
    payment_intent: stripePaymentIntentSchema,
    charge: z
      .union([
        stripeChargeIdSchema,
        z.object({ id: stripeChargeIdSchema }).passthrough(),
      ])
      .nullable()
      .optional(),
    metadata: z
      .object({ finance_refund_id: z.string().min(1).optional() })
      .passthrough()
      .nullable()
      .optional(),
  })
  .passthrough();

export const stripeDisputeSchema = z
  .object({
    id: z.string().startsWith("du_"),
    object: z.literal("dispute"),
    amount: z.number().int().positive(),
    currency: z.string().length(3),
    payment_intent: stripePaymentIntentSchema,
    charge: z
      .union([
        stripeChargeIdSchema,
        z.object({ id: stripeChargeIdSchema }).passthrough(),
      ])
      .nullable()
      .optional(),
  })
  .passthrough();

const eventEnvelopeSchema = z.object({
  id: stripeIdSchema,
  type: z.string().min(1),
  created: z.number().int().positive(),
  livemode: z.boolean(),
  account: z.string().startsWith("acct_"),
  data: z.object({ object: z.unknown() }),
});

export interface FinanceStripeReversalWebhookInput {
  stripeEventId: string;
  tenantId: string;
  orgId: string;
  stripeAccountId: string | null;
  eventType: string;
  livemode: boolean;
  payloadJson: Prisma.JsonValue;
}

export function parseEvent(input: FinanceStripeReversalWebhookInput) {
  const parsed = eventEnvelopeSchema.safeParse(input.payloadJson);
  if (
    !parsed.success ||
    parsed.data.id !== input.stripeEventId ||
    parsed.data.type !== input.eventType ||
    parsed.data.livemode !== input.livemode
  ) {
    throw new Error("Finance Stripe reversal event payload is invalid");
  }
  return parsed.data;
}

export function requireStripeAccount(
  input: FinanceStripeReversalWebhookInput,
  eventAccount: string,
): string {
  if (!input.stripeAccountId || input.stripeAccountId !== eventAccount) {
    throw new Error("Finance Stripe reversal account does not match its scope");
  }
  return input.stripeAccountId;
}

export function paymentIntentIdFromStripe(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

export function chargeIdFromStripe(
  value: string | { id: string } | null | undefined,
): string | null {
  if (typeof value === "string") return value;
  return value?.id ?? null;
}

export function financeRefundEventType(
  status: z.infer<typeof stripeRefundSchema>["status"],
): "SUBMITTED" | "CONFIRMED" | "FAILED" {
  if (status === "succeeded") return "CONFIRMED";
  if (status === "failed" || status === "canceled") return "FAILED";
  return "SUBMITTED";
}

export function assertStripeAmountMatchesReceipt(
  amount: number,
  currency: string,
  receiptAmount: bigint,
  receiptCurrency: FinanceCurrency,
): void {
  if (
    !Number.isSafeInteger(amount) ||
    BigInt(amount) > receiptAmount ||
    currency.toUpperCase() !== receiptCurrency
  ) {
    throw new Error("Finance Stripe reversal does not match receipt facts");
  }
}
