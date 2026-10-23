import type { Prisma } from "@pathway/db";
import { z } from "zod";
import {
  setupIntentSchema,
  mandateSchema,
  paymentMethodSchema,
} from "../stripe/finance-stripe-bacs-webhook.contracts";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceProviderObservation } from "./finance-provider-observation.persistence";

const currentSetup = setupIntentSchema.extend({
  status: z.enum([
    "succeeded",
    "canceled",
    "processing",
    "requires_payment_method",
    "requires_confirmation",
    "requires_action",
  ]),
});
const supported = new Set([
  "setup_intent.succeeded",
  "setup_intent.setup_failed",
  "mandate.updated",
  "payment_method.detached",
  "finance.reconciliation.setup_intent.observed",
  "finance.reconciliation.mandate.observed",
  "finance.reconciliation.payment_method.observed",
]);
export function isFinanceMandateObservationType(eventType: string): boolean {
  return supported.has(eventType);
}
function reference(
  value: string | { id: string } | null | undefined,
): string | null {
  return typeof value === "string" ? value : (value?.id ?? null);
}

/** Metadata locates an operation; stored account, customer and consent establish its identity. */
export async function matchFinanceMandateObservation(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  projected: Pick<FinanceProviderObservation, "object" | "disposition">,
): Promise<{
  disposition: FinanceProviderObservation["disposition"];
  reason: string;
}> {
  const base = {
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    stripeConnectionId: scope.connectionId,
    stripeAccountId: scope.stripeAccountId,
    livemode: scope.livemode,
  };
  const held = {
    disposition: "hold" as const,
    reason: "MANDATE_OPERATION_MISMATCH",
  };
  if (projected.disposition === "hold") return held;
  const object = projected.object;
  if (object.object === "setup_intent") {
    const parsed = currentSetup.safeParse(object);
    if (!parsed.success) return held;
    const intent = parsed.data;
    const mandate = await tx.financeMandate.findFirst({
      where: {
        ...base,
        id: intent.metadata.finance_mandate_id,
        payerAccountId: intent.metadata.finance_payer_account_id,
      },
      select: {
        consentVersion: true,
        stripeSetupIntentId: true,
        stripePaymentMethodId: true,
        stripeMandateId: true,
        stripeCustomer: {
          select: {
            stripeCustomerId: true,
            stripeAccountId: true,
            stripeConnectionId: true,
            livemode: true,
          },
        },
      },
    });
    if (
      !mandate ||
      mandate.consentVersion !== intent.metadata.finance_consent_version ||
      (mandate.stripeSetupIntentId &&
        mandate.stripeSetupIntentId !== intent.id) ||
      (reference(intent.customer) &&
        reference(intent.customer) !==
          mandate.stripeCustomer.stripeCustomerId) ||
      (mandate.stripePaymentMethodId &&
        reference(intent.payment_method) &&
        mandate.stripePaymentMethodId !== reference(intent.payment_method)) ||
      (mandate.stripeMandateId &&
        reference(intent.mandate) &&
        mandate.stripeMandateId !== reference(intent.mandate)) ||
      mandate.stripeCustomer.stripeAccountId !== scope.stripeAccountId ||
      mandate.stripeCustomer.stripeConnectionId !== scope.connectionId ||
      mandate.stripeCustomer.livemode !== scope.livemode
    )
      return held;
  } else if (object.object === "mandate") {
    const parsed = mandateSchema.safeParse(object);
    if (!parsed.success) return held;
    const mandate = await tx.financeMandate.findFirst({
      where: { ...base, stripeMandateId: parsed.data.id },
      select: {
        stripePaymentMethodId: true,
        stripeCustomer: { select: { stripeCustomerId: true } },
      },
    });
    if (
      !mandate ||
      (reference(parsed.data.payment_method) &&
        reference(parsed.data.payment_method) !==
          mandate.stripePaymentMethodId) ||
      (reference(parsed.data.customer) &&
        reference(parsed.data.customer) !==
          mandate.stripeCustomer.stripeCustomerId)
    )
      return held;
  } else if (object.object === "payment_method") {
    const parsed = paymentMethodSchema.safeParse(object);
    if (!parsed.success) return held;
    const mandate = await tx.financeMandate.findFirst({
      where: { ...base, stripePaymentMethodId: parsed.data.id },
      select: { stripeCustomer: { select: { stripeCustomerId: true } } },
    });
    if (
      !mandate ||
      (reference(parsed.data.customer) &&
        reference(parsed.data.customer) !==
          mandate.stripeCustomer.stripeCustomerId)
    )
      return held;
  } else return held;
  return {
    disposition: projected.disposition,
    reason: "MATCHED_MANDATE_OPERATION",
  };
}
