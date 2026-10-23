import type { Prisma } from "@pathway/db";
import { z } from "zod";
import type { FinanceReconciliationScope } from "../stripe/finance-stripe-reconciliation.provider";
import {
  disputeEventTypes,
  refundEventTypes,
  paymentIntentIdFromStripe,
  chargeIdFromStripe,
  stripeDisputeSchema,
} from "../stripe/finance-stripe-reversal-webhook.contracts";
import {
  projectFinanceCheckout,
  type FinanceRecoveredCheckout,
} from "./finance-checkout-recovery.contracts";
import { projectFinanceRefund } from "./finance-reversal-observation";
import {
  isFinanceBacsObservationType,
  projectFinanceBacsObject,
} from "./finance-bacs-object.projection";
import {
  isFinanceStripeCheckoutEventType,
  type FinanceStripeCheckoutEventType,
} from "../stripe/finance-stripe-checkout-events";

const envelope = z.object({
  id: z
    .string()
    .regex(/^evt_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("event"),
  type: z.string().min(1).max(255),
  created: z.number().int().positive().max(8_640_000_000_000),
  livemode: z.boolean(),
  account: z.string().optional(),
  data: z.object({ object: z.unknown() }),
});
const identity = z.object({
  id: z
    .string()
    .regex(/^[a-z][a-z0-9.]*_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.string().regex(/^[a-z][a-z0-9_.]{0,79}$/),
});
const moneyFacts = z.object({
  amount: z.number().int().safe().positive(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  status: z
    .enum([
      "succeeded",
      "processing",
      "requires_payment_method",
      "requires_action",
      "requires_confirmation",
      "canceled",
      "pending",
      "failed",
    ])
    .optional(),
});

export interface FinanceRecoveredProviderEvent {
  id: string;
  created: number;
  eventType: string;
  object: Prisma.InputJsonObject;
  disposition: "queue" | "hold" | "observed";
}
function checkoutMatchesEvent(
  type: FinanceStripeCheckoutEventType,
  checkout: FinanceRecoveredCheckout,
): boolean {
  if (type === "checkout.session.expired")
    return (
      checkout.status === "expired" && checkout.payment_status === "unpaid"
    );
  if (checkout.status !== "complete") return false;
  switch (type) {
    case "checkout.session.async_payment_succeeded":
      return checkout.payment_status === "paid";
    case "checkout.session.async_payment_failed":
      return checkout.payment_status === "unpaid";
    case "checkout.session.completed":
      return (
        checkout.payment_status === "paid" ||
        checkout.payment_status === "unpaid"
      );
  }
}
export function projectFinanceProviderEvent(
  scope: FinanceReconciliationScope,
  value: unknown,
): FinanceRecoveredProviderEvent | null {
  const parsed = envelope.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.livemode !== scope.livemode ||
    (parsed.data.account !== undefined &&
      parsed.data.account !== scope.stripeAccountId)
  )
    return null;
  const event = parsed.data;
  const type = event.type;
  const source = event.data.object;
  const base = identity.safeParse(source);
  const minimal: Prisma.InputJsonObject = base.success
    ? base.data
    : { id: event.id, object: "event" };
  let object: Prisma.InputJsonObject | null = null;
  let supported = true;
  if (isFinanceStripeCheckoutEventType(type)) {
    const checkout = projectFinanceCheckout(source);
    if (
      checkout &&
      checkoutMatchesEvent(type, checkout) &&
      checkout.livemode === scope.livemode
    )
      object = { ...checkout };
    else if (
      base.success &&
      base.data.object === "checkout.session" &&
      source &&
      typeof source === "object" &&
      "mode" in source &&
      source.mode === "setup"
    ) {
      supported = false;
      object = minimal;
    }
  } else if (refundEventTypes.has(type)) {
    object = projectFinanceRefund(source).observations[0]?.object ?? null;
    if (
      type === "refund.failed" &&
      object?.status !== "failed" &&
      object?.status !== "canceled"
    )
      object = null;
  } else if (disputeEventTypes.has(type)) {
    const dispute = stripeDisputeSchema.safeParse(source);
    if (dispute.success && Number.isSafeInteger(dispute.data.amount)) {
      object = {
        id: dispute.data.id,
        object: dispute.data.object,
        amount: dispute.data.amount,
        currency: dispute.data.currency,
        payment_intent: paymentIntentIdFromStripe(dispute.data.payment_intent),
        charge: chargeIdFromStripe(dispute.data.charge),
      };
    }
  } else if (isFinanceBacsObservationType(type)) {
    object = projectFinanceBacsObject(type, source);
  } else if (
    type === "account.updated" ||
    type === "v2.core.account.updated" ||
    type.startsWith("v2.core.account[")
  ) {
    object =
      base.success && base.data.id === scope.stripeAccountId ? minimal : null;
  } else {
    supported = false;
    object = minimal;
  }
  const nestedMode =
    source && typeof source === "object" && "livemode" in source
      ? source.livemode
      : undefined;
  if (nestedMode !== undefined && nestedMode !== scope.livemode) object = null;
  const facts = moneyFacts.safeParse(source);
  const heldObject: Prisma.InputJsonObject =
    base.success && facts.success
      ? {
          ...base.data,
          amount: facts.data.amount,
          currency: facts.data.currency,
          ...(facts.data.status ? { status: facts.data.status } : {}),
        }
      : minimal;
  return {
    id: event.id,
    created: event.created,
    eventType: type,
    object: object ?? heldObject,
    disposition: !object ? "hold" : supported ? "queue" : "observed",
  };
}
