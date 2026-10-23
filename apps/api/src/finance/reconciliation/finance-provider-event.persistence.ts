import type { Prisma } from "@pathway/db";
import { createHash } from "node:crypto";
import { isFinanceCurrency } from "@pathway/platform";
import type { FinanceReconciliationObject } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import { isFinanceStripeCheckoutEventType } from "../stripe/finance-stripe-checkout-events";
import { matchFinancePaymentIntent } from "./finance-payment-intent-match.persistence";
import {
  disputeEventTypes,
  refundEventTypes,
} from "../stripe/finance-stripe-reversal-webhook.contracts";
import { projectFinanceProviderEvent } from "./finance-provider-event.projection";
import { projectFinanceCheckout } from "./finance-checkout-recovery.contracts";
import { recoverFinanceCheckout } from "./finance-checkout-recovery.persistence";
import { financeReversalReceiptMismatch } from "./finance-reversal-recovery.persistence";
import {
  makeFinanceApiEvidence,
  captureFinanceApiEvidence,
} from "./finance-api-evidence.persistence";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";

function caseKey(reference: string, suffix: string): string {
  return `event:${createHash("sha256").update(reference).digest("hex")}:${suffix}`;
}

function money(object: Prisma.InputJsonObject) {
  const currency =
    typeof object.currency === "string" ? object.currency.toUpperCase() : "";
  return typeof object.amount === "number" &&
    Number.isSafeInteger(object.amount) &&
    object.amount > 0 &&
    isFinanceCurrency(currency)
    ? { amountMinor: BigInt(object.amount), currency }
    : undefined;
}

/** Caller checks the stored connection scope; this function performs no provider I/O. */
export async function recoverFinanceProviderEvent(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  event: FinanceReconciliationObject,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  const projected = projectFinanceProviderEvent(scope, event);
  if (!projected) {
    if (mode === "capture") {
      const evidence = makeFinanceApiEvidence(
        scope,
        "finance.reconciliation.event.invalid",
        { id: event.id, object: event.object, created: event.created },
        now,
      );
      await captureFinanceApiEvidence(tx, scope, evidence, "hold", now);
      await detectReconciliationCase(
        tx,
        scope,
        {
          key: caseKey(event.id, "invalid"),
          kind: "COVERAGE_GAP",
          resourceReference: event.id,
          details: {
            reason: "INVALID_PROVIDER_EVENT",
            evidenceEventId: evidence.eventId,
          },
        },
        now,
      );
    }
    return { recoverable: 0, exceptions: 1 };
  }
  if (
    isFinanceStripeCheckoutEventType(projected.eventType) &&
    projected.disposition === "queue"
  ) {
    const checkout = projectFinanceCheckout(projected.object);
    if (!checkout)
      throw new Error("Recovered Checkout projection is inconsistent");
    return recoverFinanceCheckout(tx, scope, { ...checkout }, now, mode, {
      id: projected.id,
      created: projected.created,
      eventType: projected.eventType,
    });
  }

  let disposition = projected.disposition;
  let reason = "UNMATCHED_PROVIDER_EVENT";
  if (
    disposition === "queue" &&
    (refundEventTypes.has(projected.eventType) ||
      disputeEventTypes.has(projected.eventType))
  ) {
    const mismatch = await financeReversalReceiptMismatch(
      tx,
      scope,
      projected.object,
    );
    if (mismatch) {
      disposition = "hold";
      reason = mismatch;
    }
  }
  if (projected.eventType.startsWith("payment_intent.")) {
    const matched = await matchFinancePaymentIntent(tx, scope, projected);
    disposition = matched.disposition;
    reason = matched.reason;
  }
  const reference =
    typeof projected.object.id === "string"
      ? projected.object.id
      : projected.id;
  const fundsConfirmed =
    projected.object.status === "succeeded" ||
    disputeEventTypes.has(projected.eventType);
  if (mode === "capture") {
    const evidence = makeFinanceApiEvidence(
      scope,
      projected.eventType,
      projected.object,
      now,
      {
        kind: "provider-event",
        id: projected.id,
        created: projected.created,
      },
    );
    await captureFinanceApiEvidence(tx, scope, evidence, disposition, now);
    if (disposition === "hold") {
      await detectReconciliationCase(
        tx,
        scope,
        {
          key: caseKey(reference, fundsConfirmed ? "money" : "operation"),
          kind: fundsConfirmed ? "UNMATCHED_MONEY" : "UNKNOWN_OPERATION",
          resourceReference: reference,
          money: money(projected.object),
          details: {
            reason,
            evidenceEventId: evidence.eventId,
            fundsConfirmed,
          },
        },
        now,
      );
    } else {
      for (const suffix of ["money", "operation"])
        await resolveReconciliationCase(
          tx,
          scope,
          caseKey(reference, suffix),
          now,
          "provider_operation_recovered",
        );
    }
  }
  return {
    recoverable: disposition === "queue" ? 1 : 0,
    exceptions: disposition === "hold" ? 1 : 0,
  };
}
