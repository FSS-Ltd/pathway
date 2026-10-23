import type { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import {
  readFinanceUnresolvedContext,
  type FinanceUnresolvedContext,
} from "./finance-unresolved-context.persistence";
import { assertReconciliationScope } from "./finance-reconciliation-scope";

/** A case names one operation. Never page through a tenant ledger to locate it. */
export async function readFinanceCaseUnresolvedContext(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  key: string,
): Promise<FinanceUnresolvedContext | null> {
  const match =
    /^(?:unresolved:|operation:)(checkout|debit|mandate|refund|dispute):([A-Za-z0-9_-]{1,128})$/.exec(
      key,
    );
  if (!match) return null;
  await assertReconciliationScope(tx, scope);
  const id = match[2];
  const base = {
    id,
    tenantId: scope.tenantId,
    orgId: scope.orgId,
    stripeConnectionId: scope.connectionId,
    stripeAccountId: scope.stripeAccountId,
  };
  const selected = { id: true, createdAt: true } as const;
  if (match[1] === "checkout") {
    const row = await tx.financeCheckoutAttempt.findFirst({
      where: { ...base, livemode: scope.livemode },
      select: { ...selected, stripeCheckoutSessionId: true },
    });
    return row
      ? readFinanceUnresolvedContext(tx, scope, {
          ...row,
          key: `checkout:${id}`,
          kind: "checkout",
          resourceId: row.stripeCheckoutSessionId,
        })
      : null;
  }
  if (match[1] === "debit") {
    const row = await tx.financeDebitAttempt.findFirst({
      where: base,
      select: { ...selected, stripePaymentIntentId: true },
    });
    return row
      ? readFinanceUnresolvedContext(tx, scope, {
          ...row,
          key: `debit:${id}`,
          kind: "debit",
          resourceId: row.stripePaymentIntentId,
        })
      : null;
  }
  if (match[1] === "mandate") {
    const row = await tx.financeMandate.findFirst({
      where: { ...base, livemode: scope.livemode },
      select: { ...selected, stripeSetupIntentId: true },
    });
    return row
      ? readFinanceUnresolvedContext(tx, scope, {
          ...row,
          key: `mandate:${id}`,
          kind: "mandate",
          resourceId: row.stripeSetupIntentId,
        })
      : null;
  }
  const refund =
    match[1] === "refund"
      ? await tx.financeRefund.findFirst({
          where: {
            id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeAccountId: scope.stripeAccountId,
            source: "STRIPE_CARD",
          },
          select: { ...selected, stripeRefundId: true, receiptId: true },
        })
      : null;
  const dispute =
    match[1] === "dispute"
      ? await tx.financeReceiptMovement.findFirst({
          where: {
            id,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            source: "STRIPE",
            type: "DISPUTE_WITHDRAWAL",
          },
          select: { ...selected, sourceReference: true, receiptId: true },
        })
      : null;
  const row = refund ?? dispute;
  if (!row) return null;
  const receipt = await tx.financeReceipt.findFirst({
    where: { id: row.receiptId, tenantId: scope.tenantId, orgId: scope.orgId },
    select: { source: true, sourceReference: true },
  });
  if (!receipt) return null;
  const payment =
    receipt.source === "STRIPE_CARD"
      ? await tx.financeCheckoutAttempt.findFirst({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
            stripeAccountId: scope.stripeAccountId,
            livemode: scope.livemode,
            stripeCheckoutSessionId: receipt.sourceReference,
          },
          select: { id: true },
        })
      : receipt.source === "STRIPE_BACS"
        ? await tx.financeDebitAttempt.findFirst({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              stripeConnectionId: scope.connectionId,
              stripeAccountId: scope.stripeAccountId,
              stripePaymentIntentId: receipt.sourceReference,
            },
            select: { id: true },
          })
        : null;
  if (!payment) return null;
  return readFinanceUnresolvedContext(tx, scope, {
    id,
    key: `${refund ? "refund" : "dispute"}:${id}`,
    kind: refund ? "refund" : "dispute",
    createdAt: row.createdAt,
    resourceId: refund?.stripeRefundId ?? dispute?.sourceReference ?? null,
  });
}
