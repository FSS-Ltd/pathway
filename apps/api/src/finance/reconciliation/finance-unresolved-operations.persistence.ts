import { Prisma } from "@pathway/db";
import type { FinanceConnectionScope } from "./finance-reconciliation.types";
import { assertReconciliationScope } from "./finance-reconciliation-scope";

export interface FinanceUnresolvedOperation {
  key: string;
  kind: "checkout" | "debit" | "mandate" | "refund" | "dispute";
  id: string;
  createdAt: Date;
  resourceId: string | null;
}

/** Read-only, keyset-paged work across all ages, including retained unknown results. */
export async function readFinanceUnresolvedPage(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  cutoff: Date,
  cursor: string | null,
  pageSize = 10,
): Promise<{ data: FinanceUnresolvedOperation[]; nextCursor: string | null }> {
  if (
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    pageSize > 10 ||
    !Number.isFinite(cutoff.getTime())
  )
    throw new Error("Finance unresolved page is invalid");
  const parts = cursor?.match(
    /^(checkout|debit|dispute|mandate|refund):([A-Za-z0-9_-]{1,200})$/,
  );
  if (cursor && !parts) throw new Error("Finance unresolved cursor is invalid");
  const enabled = (kind: FinanceUnresolvedOperation["kind"]) =>
    !parts || kind >= parts[1];
  const after = (kind: FinanceUnresolvedOperation["kind"]) =>
    parts?.[1] === kind ? parts[2] : "";
  const limit = pageSize + 1;
  await assertReconciliationScope(tx, scope);

  // The receipt has no direct connection FK. Prove it through its canonical payment identity.
  const receiptInScope = Prisma.sql`(
    (r."source" = 'STRIPE_CARD' AND EXISTS (
      SELECT 1 FROM "FinanceCheckoutAttempt" a
      WHERE a."tenantId" = ${scope.tenantId} AND a."orgId" = ${scope.orgId}
        AND a."stripeConnectionId" = ${scope.connectionId}
        AND a."stripeAccountId" = ${scope.stripeAccountId} AND a."livemode" = ${scope.livemode}
        AND a."stripeCheckoutSessionId" = r."sourceReference"
    )) OR (r."source" = 'STRIPE_BACS' AND EXISTS (
      SELECT 1 FROM "FinanceDebitAttempt" d
      WHERE d."tenantId" = ${scope.tenantId} AND d."orgId" = ${scope.orgId}
        AND d."stripeConnectionId" = ${scope.connectionId}
        AND d."stripeAccountId" = ${scope.stripeAccountId}
        AND d."stripePaymentIntentId" = r."sourceReference"
    ))
  )`;
  // Each branch reads at most one page plus a lookahead; no complete tenant ledger is materialised.
  const rows = await tx.$queryRaw<FinanceUnresolvedOperation[]>`
    SELECT * FROM (
      (SELECT 'checkout:' || a."id" AS "key", 'checkout'::text AS "kind", a."id", a."createdAt",
        a."stripeCheckoutSessionId" AS "resourceId"
       FROM "FinanceCheckoutAttempt" a
       WHERE ${enabled("checkout")} AND a."id" > ${after("checkout")}
         AND a."tenantId" = ${scope.tenantId} AND a."orgId" = ${scope.orgId}
         AND a."stripeConnectionId" = ${scope.connectionId}
         AND a."stripeAccountId" = ${scope.stripeAccountId} AND a."livemode" = ${scope.livemode}
         AND a."createdAt" < ${cutoff} AND a."status" IN ('CREATING', 'OPEN', 'COMPLETED')
       ORDER BY a."id" LIMIT ${limit})
      UNION ALL
      (SELECT 'debit:' || d."id", 'debit'::text, d."id", d."createdAt", d."stripePaymentIntentId"
       FROM "FinanceDebitAttempt" d
       WHERE ${enabled("debit")} AND d."id" > ${after("debit")}
         AND d."tenantId" = ${scope.tenantId} AND d."orgId" = ${scope.orgId}
         AND d."stripeConnectionId" = ${scope.connectionId} AND d."stripeAccountId" = ${scope.stripeAccountId}
         AND d."createdAt" < ${cutoff} AND d."status" IN ('CREATING', 'SUBMITTED', 'PROCESSING', 'UNKNOWN')
       ORDER BY d."id" LIMIT ${limit})
      UNION ALL
      (SELECT 'dispute:' || m."id", 'dispute'::text, m."id", m."createdAt", m."sourceReference"
       FROM "FinanceReceiptMovement" m
       JOIN "FinanceReceipt" r ON r."id" = m."receiptId" AND r."tenantId" = m."tenantId" AND r."orgId" = m."orgId"
       WHERE ${enabled("dispute")} AND m."id" > ${after("dispute")}
         AND m."tenantId" = ${scope.tenantId} AND m."orgId" = ${scope.orgId}
         AND m."createdAt" < ${cutoff} AND m."source" = 'STRIPE' AND m."type" = 'DISPUTE_WITHDRAWAL'
         AND ${receiptInScope} AND NOT EXISTS (
           SELECT 1 FROM "FinanceReceiptMovement" inverse
           WHERE inverse."tenantId" = ${scope.tenantId} AND inverse."orgId" = ${scope.orgId}
             AND inverse."originalMovementId" = m."id" AND inverse."type" = 'DISPUTE_REINSTATEMENT'
         )
       ORDER BY m."id" LIMIT ${limit})
      UNION ALL
      (SELECT 'mandate:' || m."id", 'mandate'::text, m."id", m."createdAt", m."stripeSetupIntentId"
       FROM "FinanceMandate" m
       WHERE ${enabled("mandate")} AND m."id" > ${after("mandate")}
         AND m."tenantId" = ${scope.tenantId} AND m."orgId" = ${scope.orgId}
         AND m."stripeConnectionId" = ${scope.connectionId}
         AND m."stripeAccountId" = ${scope.stripeAccountId} AND m."livemode" = ${scope.livemode}
         AND m."createdAt" < ${cutoff}
         AND (m."status" IN ('PENDING_SETUP', 'ACTIVE', 'UNKNOWN') OR m."providerCancellationPending")
       ORDER BY m."id" LIMIT ${limit})
      UNION ALL
      (SELECT 'refund:' || f."id", 'refund'::text, f."id", f."createdAt", f."stripeRefundId"
       FROM "FinanceRefund" f
       JOIN "FinanceReceipt" r ON r."id" = f."receiptId" AND r."tenantId" = f."tenantId" AND r."orgId" = f."orgId"
       WHERE ${enabled("refund")} AND f."id" > ${after("refund")}
         AND f."tenantId" = ${scope.tenantId} AND f."orgId" = ${scope.orgId}
         AND f."stripeAccountId" = ${scope.stripeAccountId} AND f."source" = 'STRIPE_CARD'
         AND f."createdAt" < ${cutoff} AND f."status" IN ('APPROVED', 'SUBMITTED', 'CONFIRMED')
         AND ${receiptInScope}
       ORDER BY f."id" LIMIT ${limit})
    ) candidates ORDER BY "key" LIMIT ${limit}
  `;
  const data = rows.slice(0, pageSize);
  return {
    data,
    nextCursor: rows.length > pageSize ? data[data.length - 1].key : null,
  };
}
