import { ConflictException } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Prisma } from "@pathway/db";
import type { FinanceAccessScope } from "./access/finance-access.reader";
import type { FinanceInvoiceRecord } from "./finance-records";

export interface FinanceInvoiceReview {
  reviewRevision: string;
  legalEntityName: string | null;
  payerName: string | null;
}

export async function loadFinanceInvoiceReview(
  tx: Prisma.TransactionClient,
  scope: FinanceAccessScope,
  invoice: FinanceInvoiceRecord,
): Promise<FinanceInvoiceReview> {
  const [profile, payer] = await Promise.all([
    tx.financeProfile.findFirst({
      where: {
        id: invoice.financeProfileId,
        tenantId: scope.tenantId,
        orgId: scope.orgId,
      },
      select: { legalEntityName: true },
    }),
    invoice.payerAccountId
      ? tx.financePayerAccount.findFirst({
          where: {
            id: invoice.payerAccountId,
            tenantId: scope.tenantId,
            orgId: scope.orgId,
          },
          select: { displayName: true },
        })
      : null,
  ]);
  const legalEntityName = profile?.legalEntityName ?? null;
  const currentPayerName = payer?.displayName ?? null;
  // Include event identities so identical-content review cycles and timestamp
  // collisions still invalidate an earlier human preview. Ledger allocations and
  // credits stay separate from the charge snapshot being approved and issued.
  const reviewRevision = createHash("sha256")
    .update(
      JSON.stringify({
        id: invoice.id,
        tenantId: invoice.tenantId,
        orgId: invoice.orgId,
        financeProfileId: invoice.financeProfileId,
        payerAccountId: invoice.payerAccountId,
        legalEntityName,
        payerName: currentPayerName,
        status: invoice.status,
        currency: invoice.currency,
        dueAt: invoice.dueAt?.toISOString() ?? null,
        subtotalMinor: invoice.subtotalMinor.toString(),
        taxMinor: invoice.taxMinor.toString(),
        totalMinor: invoice.totalMinor.toString(),
        createdByUserId: invoice.createdByUserId,
        approvedByUserId: invoice.approvedByUserId,
        approvedAt: invoice.approvedAt?.toISOString() ?? null,
        updatedAt: invoice.updatedAt.toISOString(),
        lines: [...invoice.lines]
          .sort((left, right) => left.lineOrder - right.lineOrder)
          .map((line) => ({
            id: line.id,
            lineOrder: line.lineOrder,
            description: line.description,
            quantity: line.quantity.toString(),
            unitAmountMinor: line.unitAmountMinor.toString(),
            taxRateBasisPoints: line.taxRateBasisPoints,
            netAmountMinor: line.netAmountMinor.toString(),
            taxAmountMinor: line.taxAmountMinor.toString(),
            totalMinor: line.totalMinor.toString(),
          })),
        events: [...invoice.events]
          .sort((left, right) => left.id.localeCompare(right.id))
          .map((event) => ({
            id: event.id,
            type: event.type,
            actorUserId: event.actorUserId,
            reason: event.reason,
            createdAt: event.createdAt.toISOString(),
          })),
      }),
    )
    .digest("hex");
  return {
    reviewRevision,
    legalEntityName,
    payerName:
      invoice.status === "ISSUED" || invoice.status === "VOID"
        ? invoice.payerNameSnapshot
        : currentPayerName,
  };
}

/** Caller holds the invoice row lock. Keep both identity rows stable until the
 * transition commits, and freeze the exact returned values when issuing.
 * expectedRevision is optional only for noninteractive internal callers; the
 * human HTTP transition contract always requires it.
 */
export async function lockAndCheckFinanceInvoiceReview(
  tx: Prisma.TransactionClient,
  scope: FinanceAccessScope,
  invoice: FinanceInvoiceRecord,
  expectedRevision?: string,
): Promise<FinanceInvoiceReview> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id" FROM "FinanceProfile"
    WHERE "id" = ${invoice.financeProfileId}
      AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId}
    FOR SHARE
  `;
  if (invoice.payerAccountId) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "FinancePayerAccount"
      WHERE "id" = ${invoice.payerAccountId}
        AND "tenantId" = ${scope.tenantId} AND "orgId" = ${scope.orgId}
      FOR SHARE
    `;
  }
  const review = await loadFinanceInvoiceReview(tx, scope, invoice);
  if (
    expectedRevision !== undefined &&
    expectedRevision !== review.reviewRevision
  ) {
    throw new ConflictException(
      "Invoice changed. Open a fresh preview before confirming this action.",
    );
  }
  return review;
}
