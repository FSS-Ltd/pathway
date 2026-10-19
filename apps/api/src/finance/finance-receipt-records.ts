import type { Prisma } from "@pathway/db";
import { addMinorUnits } from "./domain/minor-units";

export const financeReceiptInclude = {
  payerAccount: { select: { id: true, displayName: true } },
  allocations: {
    orderBy: { createdAt: "asc" },
    include: {
      invoice: {
        select: { id: true, invoiceNumber: true, status: true },
      },
      reversals: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          amountMinor: true,
          reason: true,
          actorUserId: true,
          createdAt: true,
        },
      },
      movementApplications: {
        select: {
          amountMinor: true,
          movement: { select: { type: true } },
        },
      },
    },
  },
  movements: {
    select: { amountMinor: true, type: true },
  },
} as const;

export type FinanceReceiptRecord = Prisma.FinanceReceiptGetPayload<{
  include: typeof financeReceiptInclude;
}>;

export const financeAllocationInclude = {
  reversals: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      amountMinor: true,
      reason: true,
      actorUserId: true,
      createdAt: true,
    },
  },
  movementApplications: {
    select: {
      amountMinor: true,
      movement: { select: { type: true } },
    },
  },
  invoice: { select: { id: true, invoiceNumber: true, status: true } },
} as const;

export type FinanceAllocationRecord =
  Prisma.FinanceReceiptAllocationGetPayload<{
    include: typeof financeAllocationInclude;
  }>;

export function confirmedReceiptUnapplied(
  receipt: FinanceReceiptRecord,
): bigint {
  if (receipt.status !== "CONFIRMED") return 0n;
  const allocated = receipt.allocations.reduce((total, allocation) => {
    const reversed = allocation.reversals.reduce(
      (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
      0n,
    );
    const movementImpact = allocation.movementApplications.reduce(
      (sum, application) => {
        const isReturn = isReturnMovement(application.movement.type);
        return addMinorUnits(
          sum,
          isReturn ? -application.amountMinor : application.amountMinor,
        );
      },
      0n,
    );
    const net = allocation.amountMinor - reversed - movementImpact;
    if (net < 0n) {
      throw new Error("Finance allocation reversals exceed the allocation");
    }
    return addMinorUnits(total, net);
  }, 0n);
  const netMovementOutflow = receipt.movements.reduce((sum, movement) => {
    const isReturn = isReturnMovement(movement.type);
    return addMinorUnits(
      sum,
      isReturn ? -movement.amountMinor : movement.amountMinor,
    );
  }, 0n);
  const unapplied = receipt.amountMinor - allocated - netMovementOutflow;
  return unapplied > 0n ? unapplied : 0n;
}

function isReturnMovement(
  type:
    | "REFUND"
    | "REFUND_RETURN"
    | "DISPUTE_WITHDRAWAL"
    | "DISPUTE_REINSTATEMENT",
): boolean {
  return type === "REFUND_RETURN" || type === "DISPUTE_REINSTATEMENT";
}

export function toFinanceReceiptView(receipt: FinanceReceiptRecord) {
  const unapplied = confirmedReceiptUnapplied(receipt);
  return {
    id: receipt.id,
    financeProfileId: receipt.financeProfileId,
    payerAccountId: receipt.payerAccountId,
    payerName: receipt.payerAccount?.displayName ?? null,
    amountMinor: receipt.amountMinor.toString(),
    currency: receipt.currency,
    source: receipt.source,
    sourceReference: receipt.sourceReference,
    status: receipt.status,
    confirmedAt: receipt.confirmedAt?.toISOString() ?? null,
    createdAt: receipt.createdAt.toISOString(),
    processingMinor:
      receipt.status === "PROCESSING" ? receipt.amountMinor.toString() : "0",
    failedMinor:
      receipt.status === "FAILED" ? receipt.amountMinor.toString() : "0",
    unappliedMinor: unapplied.toString(),
    allocations: receipt.allocations.map(toFinanceAllocationView),
  };
}

export function toFinanceAllocationView(allocation: FinanceAllocationRecord) {
  const reversedMinor = allocation.reversals.reduce(
    (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
    0n,
  );
  const movementImpactMinor = allocation.movementApplications.reduce(
    (sum, application) => {
      const isReturn = isReturnMovement(application.movement.type);
      return addMinorUnits(
        sum,
        isReturn ? -application.amountMinor : application.amountMinor,
      );
    },
    0n,
  );
  const netMinor = allocation.amountMinor - reversedMinor - movementImpactMinor;
  return {
    id: allocation.id,
    receiptId: allocation.receiptId,
    invoiceId: allocation.invoiceId,
    invoiceNumber: allocation.invoice.invoiceNumber?.toString() ?? null,
    amountMinor: allocation.amountMinor.toString(),
    reversedMinor: reversedMinor.toString(),
    netAmountMinor: netMinor.toString(),
    createdByUserId: allocation.createdByUserId,
    createdAt: allocation.createdAt.toISOString(),
    reversals: allocation.reversals.map(toFinanceReversalView),
  };
}

export function toFinanceReversalView(reversal: {
  id: string;
  allocationId?: string;
  amountMinor: bigint;
  reason: string;
  actorUserId: string;
  createdAt: Date;
}) {
  return {
    id: reversal.id,
    allocationId: reversal.allocationId,
    amountMinor: reversal.amountMinor.toString(),
    reason: reversal.reason,
    actorUserId: reversal.actorUserId,
    createdAt: reversal.createdAt.toISOString(),
  };
}
