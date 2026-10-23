import type { Prisma } from "@pathway/db";
import {
  paymentIntentSchema,
  paymentIntentEventStatus,
  eventStatusMatchesIntent,
} from "../stripe/finance-stripe-bacs-webhook.contracts";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceRecoveredProviderEvent } from "./finance-provider-event.projection";

export interface FinancePaymentIntentMatch {
  disposition: FinanceRecoveredProviderEvent["disposition"];
  reason: string;
}

export async function matchFinancePaymentIntent(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  projected: Pick<
    FinanceRecoveredProviderEvent,
    "eventType" | "object" | "disposition"
  >,
): Promise<FinancePaymentIntentMatch> {
  let disposition = projected.disposition;
  let reason = "UNMATCHED_PROVIDER_EVENT";
  if (disposition === "observed") return { disposition, reason };
  const id = projected.object.id;
  if (typeof id === "string") {
    const checkout = await tx.financeCheckoutAttempt.findFirst({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        stripeConnectionId: scope.connectionId,
        stripeAccountId: scope.stripeAccountId,
        livemode: scope.livemode,
        stripePaymentIntentId: id,
      },
      select: { id: true, amountMinor: true, currency: true },
    });
    if (checkout) {
      const status = paymentIntentSchema.shape.status.safeParse(
        projected.object.status,
      );
      const amount = projected.object.amount;
      const currency = projected.object.currency;
      if (
        typeof amount === "number" &&
        Number.isSafeInteger(amount) &&
        BigInt(amount) === checkout.amountMinor &&
        typeof currency === "string" &&
        currency.toUpperCase() === checkout.currency &&
        status.success &&
        eventStatusMatchesIntent(
          paymentIntentEventStatus(projected.eventType),
          status.data,
        )
      )
        disposition = "observed";
      else {
        disposition = "hold";
        reason = "CHECKOUT_PAYMENT_INTENT_MISMATCH";
      }
    } else if (disposition === "queue") {
      const debit = paymentIntentSchema.safeParse(projected.object);
      const attempt = debit.success
        ? await tx.financeDebitAttempt.findFirst({
            where: {
              id: debit.data.metadata.finance_debit_attempt_id,
              instalmentId: debit.data.metadata.finance_instalment_id,
              stripeConnectionId: scope.connectionId,
              stripeAccountId: scope.stripeAccountId,
              tenantId: scope.tenantId,
              orgId: scope.orgId,
            },
            select: {
              amountMinor: true,
              currency: true,
              stripePaymentIntentId: true,
            },
          })
        : null;
      if (
        !debit.success ||
        !attempt ||
        attempt.amountMinor !== BigInt(debit.data.amount) ||
        attempt.currency !== debit.data.currency.toUpperCase() ||
        (attempt.stripePaymentIntentId !== null &&
          attempt.stripePaymentIntentId !== id)
      ) {
        disposition = "hold";
        reason = "DEBIT_OPERATION_MISMATCH";
      }
    }
  }
  return { disposition, reason };
}
