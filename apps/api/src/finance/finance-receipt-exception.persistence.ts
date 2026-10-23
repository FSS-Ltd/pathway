import type { Prisma } from "@pathway/db";
import type { FinanceReceiptMovementInput } from "./finance-receipt-movement.service";
import {
  detectReconciliationCase,
  resolveReconciliationCase,
} from "./reconciliation/finance-reconciliation-case.persistence";

interface CombinedHistory {
  receiptId: string;
  source: string;
  sourceReference: string | null;
  principalMinor: string;
  currency: string;
  refundMinor: string;
  returnMinor: string;
}

/** Runs under the receipt lock after canonical posting; it never changes debt. */
export async function reconcileFinanceReceiptException(
  tx: Prisma.TransactionClient,
  input: Pick<
    FinanceReceiptMovementInput,
    "tenantId" | "orgId" | "receiptId" | "source"
  >,
): Promise<void> {
  if (input.source !== "STRIPE") return;
  const rows = await tx.$queryRaw<CombinedHistory[]>`
    SELECT r."id" AS "receiptId",r."source",r."sourceReference",r."amountMinor"::TEXT AS "principalMinor",r."currency",
      coalesce(sum(CASE m."type" WHEN 'REFUND' THEN m."amountMinor" WHEN 'REFUND_RETURN' THEN -m."amountMinor" ELSE 0 END),0)::TEXT AS "refundMinor",
      coalesce(sum(CASE m."type" WHEN 'DISPUTE_WITHDRAWAL' THEN m."amountMinor" WHEN 'DISPUTE_REINSTATEMENT' THEN -m."amountMinor" ELSE 0 END),0)::TEXT AS "returnMinor"
    FROM "FinanceReceipt" r JOIN "FinanceReceiptMovement" m ON m."receiptId" = r."id"
      AND m."tenantId" = r."tenantId" AND m."orgId" = r."orgId" AND m."financeProfileId" = r."financeProfileId"
    WHERE r."id" = ${input.receiptId} AND r."tenantId" = ${input.tenantId} AND r."orgId" = ${input.orgId}
      AND r."status" = 'CONFIRMED' AND m."source" = 'STRIPE'
    GROUP BY r."id"
    HAVING bool_or(m."type" = 'REFUND') AND bool_or(m."type" = 'DISPUTE_WITHDRAWAL')
  `;
  const history = rows[0];
  if (!history) return;
  if (!history.sourceReference)
    throw new Error("Canonical provider receipt has no original reference");
  const connectionSelect = {
    stripeConnection: {
      select: { id: true, stripeAccountId: true, livemode: true },
    },
  } as const;
  const where = { tenantId: input.tenantId, orgId: input.orgId };
  const payment =
    history.source === "STRIPE_CARD"
      ? await tx.financeCheckoutAttempt.findFirst({
          where: { ...where, stripeCheckoutSessionId: history.sourceReference },
          select: connectionSelect,
        })
      : history.source === "STRIPE_BACS"
        ? await tx.financeDebitAttempt.findFirst({
            where: { ...where, stripePaymentIntentId: history.sourceReference },
            select: connectionSelect,
          })
        : null;
  const connection = payment?.stripeConnection;
  if (!connection?.stripeAccountId)
    throw new Error("Confirmed provider receipt has no retained connection");
  const scope = {
    ...where,
    connectionId: connection.id,
    stripeAccountId: connection.stripeAccountId,
    livemode: connection.livemode,
  };
  const key = `refund-return:${history.receiptId}`;
  const now = new Date();
  const refund = BigInt(history.refundMinor);
  const returned = BigInt(history.returnMinor);
  if (refund <= 0n || returned <= 0n) {
    await resolveReconciliationCase(
      tx,
      scope,
      key,
      now,
      "combined_withdrawal_reversed_by_confirmed_movements",
    );
    return;
  }
  const difference = refund + returned - BigInt(history.principalMinor);
  const excess = difference > 0n ? difference : 0n;
  await detectReconciliationCase(
    tx,
    scope,
    {
      key,
      kind: "REFUND_AND_RETURN",
      resourceReference: history.receiptId,
      money: { amountMinor: excess, currency: history.currency },
      details: {
        reason: "REFUND_AND_INDEPENDENT_PRINCIPAL_RETURN",
        receiptId: history.receiptId,
        confirmedRefundMinor: refund.toString(),
        confirmedReturnMinor: returned.toString(),
        excessMinor: excess.toString(),
        debtInferred: false,
      },
    },
    now,
  );
}
