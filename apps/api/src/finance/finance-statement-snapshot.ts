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
  const closingAt = new Date(input.periodEnd.getTime() - 1);
  // Closing a period freezes facts recorded by that period's end. Later evidence
  // belongs to its recorded period, even when the provider occurrence is older.
  const ledgerCutoffAt =
    input.generatedAt < closingAt ? input.generatedAt : closingAt;
  const openingAt = new Date(input.periodStart.getTime() - 1);
  const closingCutoffAt = ledgerCutoffAt;
  const [
    openingBalance,
    closingBalance,
    activity,
    confirmedReceipts,
    processingReceipts,
    receiptMovements,
  ] = await Promise.all([
    balances.accountBalanceAt(
      tx,
      scope,
      input.payerAccountId,
      openingAt,
      openingAt,
    ),
    balances.accountBalanceAt(
      tx,
      scope,
      input.payerAccountId,
      closingAt,
      ledgerCutoffAt,
    ),
    loadFinanceStatementActivity(tx, scope, input.payerAccountId, {
      ...input,
      generatedAt: ledgerCutoffAt,
    }),
    tx.financeReceipt.findMany({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        payerAccountId: input.payerAccountId,
        status: "CONFIRMED",
        createdAt: { lte: ledgerCutoffAt },
        confirmedAt: { lte: closingCutoffAt },
      },
      select: {
        id: true,
        amountMinor: true,
        allocations: {
          where: { createdAt: { lte: closingCutoffAt } },
          select: {
            amountMinor: true,
            reversals: {
              where: { createdAt: { lte: closingCutoffAt } },
              select: { amountMinor: true },
            },
            movementApplications: {
              where: {
                createdAt: { lte: ledgerCutoffAt },
                movement: {
                  is: {
                    createdAt: { lte: ledgerCutoffAt },
                    occurredAt: { lte: closingCutoffAt },
                  },
                },
              },
              select: {
                amountMinor: true,
                movement: { select: { type: true } },
              },
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
        createdAt: { lte: closingCutoffAt },
        OR: [
          {
            status: "PROCESSING",
            updatedAt: { lte: closingCutoffAt },
          },
          {
            status: { in: ["CONFIRMED", "FAILED"] },
            updatedAt: { gt: closingCutoffAt },
          },
        ],
      },
      select: { amountMinor: true },
    }),
    tx.financeReceiptMovement.findMany({
      where: {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        receipt: { is: { payerAccountId: input.payerAccountId } },
        createdAt: { lte: ledgerCutoffAt },
        occurredAt: { lte: closingCutoffAt },
      },
      select: { receiptId: true, amountMinor: true, type: true },
    }),
  ]);
  const movementOutflowByReceipt = new Map<string, bigint>();
  for (const movement of receiptMovements) {
    const isReturn =
      movement.type === "REFUND_RETURN" ||
      movement.type === "DISPUTE_REINSTATEMENT";
    movementOutflowByReceipt.set(
      movement.receiptId,
      addMinorUnits(
        movementOutflowByReceipt.get(movement.receiptId) ?? 0n,
        isReturn ? -movement.amountMinor : movement.amountMinor,
      ),
    );
  }
  let unapplied = 0n;
  let uncoveredOutflows = 0n;
  for (const receipt of confirmedReceipts) {
    const receiptAllocation = receipt.allocations.reduce((sum, allocation) => {
      const reversed = allocation.reversals.reduce(
        (reversalSum, reversal) =>
          addMinorUnits(reversalSum, reversal.amountMinor),
        0n,
      );
      const movementImpact = allocation.movementApplications.reduce(
        (impactSum, application) => {
          const isReturn =
            application.movement.type === "REFUND_RETURN" ||
            application.movement.type === "DISPUTE_REINSTATEMENT";
          return addMinorUnits(
            impactSum,
            isReturn ? -application.amountMinor : application.amountMinor,
          );
        },
        0n,
      );
      const net = allocation.amountMinor - reversed - movementImpact;
      if (net < 0n) {
        throw new Error("Finance receipt applications exceed an allocation");
      }
      return addMinorUnits(sum, net);
    }, 0n);
    const available =
      receipt.amountMinor -
      receiptAllocation -
      (movementOutflowByReceipt.get(receipt.id) ?? 0n);
    if (available > 0n) {
      unapplied = addMinorUnits(unapplied, available);
    } else if (available < 0n) {
      uncoveredOutflows = addMinorUnits(uncoveredOutflows, -available);
    }
  }
  const totals = buildFinanceStatementTotals({
    openingBalanceMinor: BigInt(openingBalance),
    chargesIssuedMinor: activity.chargesMinor,
    creditsIssuedMinor: activity.creditsMinor,
    allocatedReceiptsMinor: activity.allocationsMinor,
    reversalsMinor: activity.reversalsMinor,
    unappliedFundsMinor: unapplied,
    uncoveredOutflowsMinor: uncoveredOutflows,
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
