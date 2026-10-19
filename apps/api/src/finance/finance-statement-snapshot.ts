import type { Prisma } from "@pathway/db";
import type { FinanceBalanceService } from "./finance-balance.service";
import type { FinanceCurrency } from "@pathway/platform";
import { addMinorUnits } from "./domain/minor-units";
import { buildFinanceStatementTotals } from "./finance-statement-projection";
import { loadFinanceStatementActivity } from "./finance-statement-activity";
import {
  financeStatementSnapshotSchema,
  type FinanceStatementScope,
  type FinanceStatementSnapshot,
} from "./finance-statement-snapshot-schema";

export {
  financeStatementSnapshotSchema,
  type FinanceStatementSnapshot,
} from "./finance-statement-snapshot-schema";

export async function buildFinanceStatementSnapshot(
  tx: Prisma.TransactionClient,
  balances: FinanceBalanceService,
  scope: FinanceStatementScope,
  input: {
    payerAccountId: string;
    payerName: string;
    legalEntityName: string;
    currency: FinanceCurrency;
    periodStart: Date;
    periodEnd: Date;
    generatedAt: Date;
  },
): Promise<FinanceStatementSnapshot> {
  if (input.periodEnd <= input.periodStart) {
    throw new RangeError("Statement period end must follow its start");
  }
  const ledgerCutoffAt = input.generatedAt;
  const closingAt = new Date(input.periodEnd.getTime() - 1);
  const openingAt = new Date(input.periodStart.getTime() - 1);
  const [
    openingBalance,
    closingBalance,
    activity,
    confirmedReceipts,
    processingReceipts,
  ] = await Promise.all([
    balances.accountBalanceAt(
      tx,
      scope,
      input.payerAccountId,
      openingAt,
      ledgerCutoffAt,
    ),
    balances.accountBalanceAt(
      tx,
      scope,
      input.payerAccountId,
      closingAt,
      ledgerCutoffAt,
    ),
    loadFinanceStatementActivity(tx, scope, input.payerAccountId, input),
    tx.financeReceipt.findMany({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        payerAccountId: input.payerAccountId,
        status: "CONFIRMED",
        createdAt: { lte: ledgerCutoffAt },
        confirmedAt: { lte: closingAt },
      },
      select: {
        amountMinor: true,
        allocations: {
          where: { createdAt: { lte: closingAt } },
          select: {
            amountMinor: true,
            reversals: {
              where: { createdAt: { lte: closingAt } },
              select: { amountMinor: true },
            },
          },
        },
      },
    }),
    tx.financeReceipt.findMany({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        payerAccountId: input.payerAccountId,
        createdAt: { lte: closingAt },
        OR: [
          {
            status: "PROCESSING",
            updatedAt: { lte: closingAt },
          },
          {
            status: { in: ["CONFIRMED", "FAILED"] },
            updatedAt: { gt: closingAt },
          },
        ],
      },
      select: { amountMinor: true },
    }),
  ]);

  const totalReceipts = confirmedReceipts.reduce(
    (sum, receipt) => addMinorUnits(sum, receipt.amountMinor),
    0n,
  );
  const netAllocated = confirmedReceipts.reduce(
    (sum, receipt) =>
      receipt.allocations.reduce((receiptSum, allocation) => {
        const reversed = allocation.reversals.reduce(
          (reversalSum, reversal) =>
            addMinorUnits(reversalSum, reversal.amountMinor),
          0n,
        );
        return addMinorUnits(receiptSum, allocation.amountMinor - reversed);
      }, sum),
    0n,
  );
  const unapplied = totalReceipts - netAllocated;
  if (unapplied < 0n) {
    throw new Error("Finance allocations exceed confirmed account receipts");
  }
  const totals = buildFinanceStatementTotals({
    openingBalanceMinor: BigInt(openingBalance),
    chargesIssuedMinor: activity.chargesMinor,
    creditsIssuedMinor: activity.creditsMinor,
    allocatedReceiptsMinor: activity.allocationsMinor,
    reversalsMinor: activity.reversalsMinor,
    unappliedFundsMinor: unapplied,
    processingFundsMinor: processingReceipts.reduce(
      (sum, receipt) => addMinorUnits(sum, receipt.amountMinor),
      0n,
    ),
  });
  if (totals.closingBalanceMinor !== closingBalance) {
    throw new Error(
      "Finance statement movements do not reconcile to the ledger",
    );
  }
  return financeStatementSnapshotSchema.parse({
    version: 1,
    currency: input.currency,
    payerName: input.payerName,
    legalEntityName: input.legalEntityName,
    periodStart: input.periodStart.toISOString(),
    periodEnd: input.periodEnd.toISOString(),
    generatedAt: input.generatedAt.toISOString(),
    ledgerCutoffAt: ledgerCutoffAt.toISOString(),
    totals,
    lines: activity.lines,
  });
}
