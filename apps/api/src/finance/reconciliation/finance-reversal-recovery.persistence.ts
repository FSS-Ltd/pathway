import type { Prisma } from "@pathway/db";
import { findReceiptForPaymentIntent } from "../stripe/finance-stripe-reversal-webhook.persistence";
import type { FinanceReconciliationObject } from "../stripe/finance-stripe-reconciliation.provider";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import type { FinanceReconciliationPageSummary } from "./finance-reconciliation-runner";
import {
  captureFinanceApiEvidence,
  makeFinanceApiEvidence,
} from "./finance-api-evidence.persistence";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./finance-reconciliation-case.persistence";
import {
  projectFinanceDispute,
  projectFinanceRefund,
  type FinanceReversalObservation,
} from "./finance-reversal-observation";

async function matchReversal(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  observation: FinanceReversalObservation,
): Promise<string | null> {
  const object = observation.object;
  const paymentIntentId = object.payment_intent;
  if (typeof paymentIntentId !== "string") return "MISSING_PAYMENT_INTENT";
  const payment = await findReceiptForPaymentIntent(
    tx,
    scope,
    scope.stripeAccountId,
    paymentIntentId,
  );
  if (!payment) return "MISSING_CONFIRMED_RECEIPT";
  if (
    typeof object.amount !== "number" ||
    BigInt(object.amount) > payment.receipt.amountMinor ||
    typeof object.currency !== "string" ||
    object.currency.toUpperCase() !== payment.receipt.currency
  )
    return "RECEIPT_MONEY_MISMATCH";
  if (observation.eventType.startsWith("refund.")) {
    const metadata = object.metadata;
    const refundId =
      metadata &&
      typeof metadata === "object" &&
      !Array.isArray(metadata) &&
      "finance_refund_id" in metadata
        ? metadata.finance_refund_id
        : undefined;
    if (typeof refundId === "string") {
      const refund = await tx.financeRefund.findFirst({
        where: {
          id: refundId,
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          receiptId: payment.receipt.id,
          stripeAccountId: scope.stripeAccountId,
        },
        select: { amountMinor: true, currency: true, stripeRefundId: true },
      });
      if (
        !refund ||
        refund.amountMinor !== BigInt(object.amount) ||
        refund.currency !== object.currency.toUpperCase() ||
        (refund.stripeRefundId !== null && refund.stripeRefundId !== object.id)
      )
        return "REFUND_REQUEST_MISMATCH";
    }
  }
  return null;
}

/** A provider read must be account/mode checked before this transaction begins. */
export async function recoverFinanceReversal(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  stream: "refunds" | "disputes",
  object: FinanceReconciliationObject,
  now: Date,
  mode: "capture" | "dry-run",
): Promise<FinanceReconciliationPageSummary> {
  const projection =
    stream === "refunds"
      ? projectFinanceRefund(object)
      : projectFinanceDispute(object);
  const first = projection.observations[0];
  const issue =
    projection.issue ??
    (object.livemode !== undefined && object.livemode !== scope.livemode
      ? "PROVIDER_MODE_MISMATCH"
      : first
        ? await matchReversal(tx, scope, first)
        : "NO_MOVEMENT_EVIDENCE");
  const fundsConfirmed =
    Boolean(first?.movement) || first?.object.status === "succeeded";
  const caseKey = `reversal:${object.id}:${fundsConfirmed ? "money" : "operation"}`;
  if (issue) {
    if (mode === "capture") {
      const evidence = makeFinanceApiEvidence(
        scope,
        "finance.reconciliation.reversal.unmatched",
        first?.object ?? {
          id: object.id,
          object: object.object,
          created: object.created,
          livemode: scope.livemode,
        },
        now,
      );
      await captureFinanceApiEvidence(tx, scope, evidence, "hold", now);
      await detectReconciliationCase(
        tx,
        scope,
        {
          key: caseKey,
          kind: fundsConfirmed ? "UNMATCHED_MONEY" : "UNKNOWN_OPERATION",
          resourceReference: object.id,
          details: {
            reason: issue,
            evidenceEventId: evidence.eventId,
            fundsConfirmed,
          },
        },
        now,
      );
    }
    return { recoverable: 0, exceptions: 1 };
  }
  let exceptions = 0;
  if (stream === "refunds" && first?.object.failure_balance_transaction) {
    const original = await tx.financeReceiptMovement.findFirst({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        type: "REFUND",
        source: "STRIPE",
        sourceReference: object.id,
      },
      select: { id: true },
    });
    const gapKey = `reversal:${object.id}:refund-history`;
    if (!original) {
      exceptions++;
      if (mode === "capture")
        await detectReconciliationCase(
          tx,
          scope,
          {
            key: gapKey,
            kind: "COVERAGE_GAP",
            resourceReference: object.id,
            details: { reason: "REFUND_SUCCESS_HISTORY_MISSING" },
          },
          now,
        );
    } else if (mode === "capture") {
      await resolveReconciliationCase(
        tx,
        scope,
        gapKey,
        now,
        "refund_history_recovered",
      );
    }
  }
  if (mode === "dry-run") return { recoverable: 1, exceptions };
  for (const observation of projection.observations) {
    const evidence = makeFinanceApiEvidence(
      scope,
      observation.eventType,
      observation.object,
      now,
      observation.movement
        ? { kind: "balance-transaction", ...observation.movement }
        : { kind: "current-object" },
    );
    await captureFinanceApiEvidence(tx, scope, evidence, "queue", now);
  }
  await resolveReconciliationCase(
    tx,
    scope,
    caseKey,
    now,
    "provider_receipt_matched",
  );
  await resolveReconciliationCase(
    tx,
    scope,
    `reversal:${object.id}:${fundsConfirmed ? "operation" : "money"}`,
    now,
    "provider_receipt_matched",
  );
  return { recoverable: 1, exceptions };
}
