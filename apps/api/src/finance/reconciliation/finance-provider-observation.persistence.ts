import type { Prisma } from "@pathway/db";
import { createHash } from "node:crypto";
import { isFinanceCurrency } from "@pathway/platform";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import {
  disputeEventTypes,
  refundEventTypes,
} from "../stripe/finance-stripe-reversal-webhook.contracts";
import { financeReversalReceiptMismatch } from "./finance-reversal-recovery.persistence";
import {
  isFinanceMandateObservationType,
  matchFinanceMandateObservation,
} from "./finance-mandate-match.persistence";
import { matchFinancePaymentIntent } from "./finance-payment-intent-match.persistence";
import {
  captureFinanceApiEvidence,
  makeFinanceApiEvidence,
  type FinanceApiEvidenceOrigin,
} from "./finance-api-evidence.persistence";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";

export interface FinanceProviderObservation {
  eventType: string;
  object: Prisma.InputJsonObject;
  disposition: "queue" | "hold" | "observed";
  resourceReference: string;
  origin: FinanceApiEvidenceOrigin;
}

export function financeObservationCaseKey(
  reference: string,
  suffix: string,
): string {
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

export async function recoverFinanceProviderObservation(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  projected: FinanceProviderObservation,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
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
  if (isFinanceMandateObservationType(projected.eventType)) {
    const matched = await matchFinanceMandateObservation(tx, scope, projected);
    disposition = matched.disposition;
    reason = matched.reason;
  }
  const reference = projected.resourceReference;
  const fundsConfirmed =
    ((projected.object.object === "payment_intent" ||
      projected.object.object === "refund") &&
      projected.object.status === "succeeded") ||
    disputeEventTypes.has(projected.eventType);
  if (mode === "capture") {
    const evidence = makeFinanceApiEvidence(
      scope,
      projected.eventType,
      projected.object,
      now,
      projected.origin,
    );
    await captureFinanceApiEvidence(tx, scope, evidence, disposition, now);
    if (disposition === "hold") {
      await detectReconciliationCase(
        tx,
        scope,
        {
          key: financeObservationCaseKey(
            reference,
            fundsConfirmed ? "money" : "operation",
          ),
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
          financeObservationCaseKey(reference, suffix),
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
