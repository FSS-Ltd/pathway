import { z } from "zod";
import type { FinanceReconciliationScope } from "../stripe/finance-stripe-reconciliation.provider";
import { projectFinanceBacsObject } from "./finance-bacs-object.projection";
import type { FinanceProviderObservation } from "./finance-provider-observation.persistence";

const intentSchema = z.object({
  id: z
    .string()
    .regex(/^pi_[A-Za-z0-9_]+$/)
    .max(255),
  object: z.literal("payment_intent"),
  livemode: z.boolean(),
  status: z.enum([
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
    "processing",
    "requires_capture",
    "canceled",
    "succeeded",
  ]),
  amount: z.number().int().safe().positive(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
});

function eventType(status: z.infer<typeof intentSchema>["status"]): string {
  switch (status) {
    case "processing":
      return "payment_intent.processing";
    case "succeeded":
      return "payment_intent.succeeded";
    case "requires_payment_method":
      return "payment_intent.payment_failed";
    case "canceled":
      return "payment_intent.canceled";
    default:
      return "finance.reconciliation.payment_intent.unconfirmed";
  }
}

export function projectFinancePaymentIntent(
  scope: FinanceReconciliationScope,
  value: unknown,
): FinanceProviderObservation | null {
  const parsed = intentSchema.safeParse(value);
  if (!parsed.success || parsed.data.livemode !== scope.livemode) return null;
  const intent = parsed.data;
  const type = eventType(intent.status);
  const bacs = projectFinanceBacsObject(type, value);
  return {
    eventType: type,
    object: bacs ?? {
      id: intent.id,
      object: intent.object,
      amount: intent.amount,
      currency: intent.currency,
      status: intent.status,
    },
    disposition: bacs ? "queue" : "hold",
    resourceReference: intent.id,
    origin: { kind: "current-object" },
  };
}
