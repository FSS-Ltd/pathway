import type { Prisma } from "@pathway/db";
import { addMinorUnits } from "./domain/minor-units";
import { financeReconciliationCaseKey } from "./reconciliation/finance-reconciliation-case-key";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./reconciliation/finance-reconciliation-case.persistence";

interface ExternalRefundScope {
  tenantId: string;
  orgId: string;
  financeProfileId: string;
  receiptId: string;
  stripeAccountId: string;
  livemode: boolean;
  refundReference: string;
}

/** Caller holds the receipt lock after canonical posting. This review signal
 * never changes an allocation, grants credit or infers school treatment.
 */
export async function reconcileFinanceExternalRefundReview(
  tx: Prisma.TransactionClient,
  input: ExternalRefundScope,
): Promise<void> {
  const refund = await tx.financeReceiptMovement.findFirst({
    where: {
      tenantId: input.tenantId,
      orgId: input.orgId,
      financeProfileId: input.financeProfileId,
      receiptId: input.receiptId,
      source: "STRIPE",
      type: "REFUND",
      sourceReference: input.refundReference,
      refundId: null,
    },
    select: {
      amountMinor: true,
      currency: true,
      inverseMovements: {
        where: { type: "REFUND_RETURN" },
        select: { amountMinor: true },
      },
    },
  });
  if (!refund) return;
  const connection = await tx.financeStripeConnection.findFirst({
    where: {
      tenantId: input.tenantId,
      orgId: input.orgId,
      financeProfileId: input.financeProfileId,
      stripeAccountId: input.stripeAccountId,
      livemode: input.livemode,
    },
    select: { id: true },
  });
  if (!connection) throw new Error("External refund connection unavailable");
  const scope = { ...input, connectionId: connection.id };
  const key = financeReconciliationCaseKey(
    "reversal",
    input.refundReference,
    "operation",
  );
  const returnedMinor = refund.inverseMovements.reduce(
    (total, movement) => addMinorUnits(total, movement.amountMinor),
    0n,
  );
  const netMinor = refund.amountMinor - returnedMinor;
  const now = new Date();
  if (netMinor <= 0n) {
    await resolveReconciliationCase(
      tx,
      scope,
      key,
      now,
      "external_refund_returned_by_confirmed_movement",
    );
    return;
  }
  await detectReconciliationCase(
    tx,
    scope,
    {
      key,
      kind: "UNKNOWN_OPERATION",
      resourceReference: input.refundReference,
      money: { amountMinor: netMinor, currency: refund.currency },
      details: {
        reason: "EXTERNAL_REFUND_PENDING_TREATMENT",
        receiptId: input.receiptId,
        treatment: "REOPEN_BALANCE",
        confirmedRefundMinor: refund.amountMinor.toString(),
        confirmedReturnMinor: returnedMinor.toString(),
        fundsConfirmed: true,
      },
    },
    now,
  );
}
