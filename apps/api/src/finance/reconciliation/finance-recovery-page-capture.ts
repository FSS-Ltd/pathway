import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationStream } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceReconciliationPageSummary } from "./finance-recovery-page-runner";
import type { FinancePreparedRecoveryObject } from "./finance-recovery-page-preparation";
import { recoverFinanceProviderEvent } from "./finance-provider-event.persistence";
import { recoverFinanceCheckout } from "./finance-checkout-recovery.persistence";
import { recoverFinancePaymentIntent } from "./finance-payment-intent-recovery.persistence";
import { recoverFinanceReversal } from "./finance-reversal-recovery.persistence";
import { recoverFinanceMandateObject } from "./finance-mandate-recovery.persistence";
import { captureFinanceSettlementObservation } from "./finance-settlement.persistence";
import {
  captureFinanceApiEvidence,
  makeFinanceApiEvidence,
} from "./finance-api-evidence.persistence";

async function captureObject(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  stream: FinanceReconciliationStream,
  object: FinancePreparedRecoveryObject,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  if (object.kind === "mandate") {
    if (stream !== "setupIntents")
      throw new Error("Unexpected mandate recovery stream");
    return recoverFinanceMandateObject(tx, scope, object.mandate, now, mode);
  }
  if (object.kind === "payout") {
    if (stream !== "payouts")
      throw new Error("Unexpected payout recovery stream");
    return captureFinanceSettlementObservation(
      tx,
      scope,
      "payouts",
      object.raw,
      now,
      object.payout,
      mode,
    );
  }
  const raw = object.raw;
  switch (stream) {
    case "events":
      return recoverFinanceProviderEvent(tx, scope, raw, now, mode);
    case "checkoutSessions": {
      if (raw.mode !== "setup")
        return recoverFinanceCheckout(tx, scope, raw, now, mode);
      if (mode === "capture")
        await captureFinanceApiEvidence(
          tx,
          scope,
          makeFinanceApiEvidence(
            scope,
            "finance.reconciliation.checkout_session.observed",
            {
              id: raw.id,
              object: "checkout.session",
              mode: "setup",
              created: raw.created,
            },
            now,
          ),
          "observed",
          now,
        );
      return { recoverable: 0, exceptions: 0 };
    }
    case "paymentIntents":
      return recoverFinancePaymentIntent(tx, scope, raw, now, mode);
    case "refunds":
    case "disputes":
      return recoverFinanceReversal(tx, scope, stream, raw, now, mode);
    case "charges":
    case "balanceTransactions":
      return captureFinanceSettlementObservation(
        tx,
        scope,
        stream,
        raw,
        now,
        undefined,
        mode,
      );
    case "payouts":
    case "setupIntents":
      throw new Error("Finance recovery object was not prepared");
  }
}

/** Called inside the page/cursor transaction; this function performs no remote I/O. */
export async function captureFinanceRecoveryPage(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  stream: FinanceReconciliationStream,
  objects: FinancePreparedRecoveryObject[],
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  const summary = { recoverable: 0, exceptions: 0 };
  for (const object of objects) {
    const result = await captureObject(tx, scope, stream, object, now, mode);
    summary.recoverable += result.recoverable;
    summary.exceptions += result.exceptions;
  }
  return summary;
}
