import { addMinorUnits } from "./domain/minor-units";
import type { FinanceReportPeriod } from "./finance-report-period";
import type {
  FinanceReportInvoice,
  FinanceReportRow,
  FinanceReportTotals,
} from "./finance-report.types";

export type FinanceAgeingBucket =
  | "NOT_YET_DUE"
  | "DAYS_1_TO_30"
  | "DAYS_31_TO_60"
  | "DAYS_61_TO_90"
  | "OVER_90_DAYS";

export function ageingBucket(
  dueAt: Date | null,
  asOfDate: string,
): { bucket: FinanceAgeingBucket; overdueDays: number } {
  if (!dueAt) return { bucket: "NOT_YET_DUE", overdueDays: 0 };
  const asOf = dateKeyUtc(asOfDate);
  const due = dateKeyUtc(londonDateKey(dueAt));
  const overdueDays = Math.max(0, Math.floor((asOf - due) / 86_400_000));
  if (overdueDays === 0) return { bucket: "NOT_YET_DUE", overdueDays };
  if (overdueDays <= 30) return { bucket: "DAYS_1_TO_30", overdueDays };
  if (overdueDays <= 60) return { bucket: "DAYS_31_TO_60", overdueDays };
  if (overdueDays <= 90) return { bucket: "DAYS_61_TO_90", overdueDays };
  return { bucket: "OVER_90_DAYS", overdueDays };
}

export function sumMinorUnits(values: readonly bigint[]): bigint {
  return values.reduce((total, value) => addMinorUnits(total, value), 0n);
}

export function netAllocationMinor(
  allocationMinor: bigint,
  reversalMinor: bigint,
): bigint {
  const net = allocationMinor - reversalMinor;
  if (net < 0n)
    throw new Error("Finance allocation reversals exceed the allocation");
  return net;
}

export function calculateFinanceReportTotals(input: {
  invoices: FinanceReportInvoice[];
  periodCredits: Array<{ totalMinor: bigint }>;
  periodReceipts: Array<{ amountMinor: bigint }>;
  periodMovements: Array<{ type: string; amountMinor: bigint }>;
  periodAllocations: Array<{
    amountMinor: bigint;
    reversals: Array<{ amountMinor: bigint }>;
  }>;
  confirmedReceipts: Array<{
    amountMinor: bigint;
    movements: Array<{ amountMinor: bigint; type: string }>;
    allocations: Array<{
      amountMinor: bigint;
      reversals: Array<{ amountMinor: bigint }>;
      movementApplications: Array<{
        amountMinor: bigint;
        movement: { type: string };
      }>;
    }>;
  }>;
  processingReceipts: Array<{ amountMinor: bigint }>;
  pendingManualReceipts: Array<{ amountMinor: bigint }>;
  pendingRefunds: Array<{ amountMinor: bigint }>;
  failedReceipts: Array<{ amountMinor: bigint }>;
  transferNotices: Array<{ amountMinor: bigint }>;
  period: FinanceReportPeriod;
  externalRefundReviewAmounts?: readonly bigint[];
}): FinanceReportTotals {
  const refunds = input.periodMovements
    .filter(
      (movement) =>
        movement.type === "REFUND" || movement.type === "DISPUTE_WITHDRAWAL",
    )
    .map((movement) => movement.amountMinor);
  const returns = input.periodMovements
    .filter(
      (movement) =>
        movement.type === "REFUND_RETURN" ||
        movement.type === "DISPUTE_REINSTATEMENT",
    )
    .map((movement) => movement.amountMinor);
  const overdue = input.invoices
    .filter(
      (invoice) =>
        BigInt(invoice.balance.outstandingMinor) > 0n &&
        invoice.dueAt &&
        financeLocalDateKey(invoice.dueAt) < input.period.asOfDate,
    )
    .map((invoice) => BigInt(invoice.balance.outstandingMinor));
  const unapplied = input.confirmedReceipts.map((receipt) =>
    receiptUnapplied(
      receipt.amountMinor,
      receipt.allocations,
      receipt.movements,
    ),
  );
  const allocated = input.periodAllocations.map((allocation) =>
    netAllocationMinor(
      allocation.amountMinor,
      sumMinorUnits(
        allocation.reversals.map((reversal) => reversal.amountMinor),
      ),
    ),
  );
  const refundTotal = sumMinorUnits(refunds);
  const returnTotal = sumMinorUnits(returns);

  return {
    issuedGrossMinor: sumMinorUnits(
      input.invoices
        .filter(
          (invoice) =>
            invoice.issuedAt &&
            isInPeriod(
              invoice.issuedAt,
              input.period.periodStart,
              input.period.periodEnd,
            ),
        )
        .map((invoice) => invoice.totalMinor),
    ).toString(),
    creditsMinor: sumMinorUnits(
      input.periodCredits.map((credit) => credit.totalMinor),
    ).toString(),
    confirmedReceiptsMinor: sumMinorUnits(
      input.periodReceipts.map((receipt) => receipt.amountMinor),
    ).toString(),
    refundsMinor: refundTotal.toString(),
    returnsMinor: returnTotal.toString(),
    refundsAndReturnsMinor: addMinorUnits(refundTotal, returnTotal).toString(),
    allocatedReceiptsMinor: sumMinorUnits(allocated).toString(),
    outstandingMinor: sumMinorUnits(
      input.invoices.map((invoice) => BigInt(invoice.balance.outstandingMinor)),
    ).toString(),
    overdueMinor: sumMinorUnits(overdue).toString(),
    unappliedMinor: sumMinorUnits(
      unapplied.map((amount) => BigInt(amount)),
    ).toString(),
    processingMinor: sumMinorUnits(
      input.processingReceipts.map((receipt) => receipt.amountMinor),
    ).toString(),
    reviewRequiredMinor: sumMinorUnits([
      ...(input.externalRefundReviewAmounts ?? []),
      ...input.pendingManualReceipts.map((receipt) => receipt.amountMinor),
      ...input.pendingRefunds.map((refund) => refund.amountMinor),
      ...input.failedReceipts.map((receipt) => receipt.amountMinor),
      ...input.transferNotices.map((notice) => notice.amountMinor),
      ...unapplied.map((amount) => BigInt(amount)),
    ]).toString(),
  };
}

export function receiptUnapplied(
  amountMinor: bigint,
  allocations: Array<{
    amountMinor: bigint;
    reversals: Array<{ amountMinor: bigint }>;
    movementApplications?: Array<{
      amountMinor: bigint;
      movement: { type: string };
    }>;
  }>,
  movements: Array<{ amountMinor: bigint; type: string }>,
): string {
  const allocated = sumMinorUnits(
    allocations.map((allocation) => {
      const reversed = sumMinorUnits(
        allocation.reversals.map(({ amountMinor: amount }) => amount),
      );
      const movementImpact = sumMinorUnits(
        (allocation.movementApplications ?? []).map((application) =>
          isReturnMovement(application.movement.type)
            ? -application.amountMinor
            : application.amountMinor,
        ),
      );
      return netAllocationMinor(
        allocation.amountMinor,
        addMinorUnits(reversed, movementImpact),
      );
    }),
  );
  const movementOutflow = sumMinorUnits(
    movements.map((movement) =>
      isReturnMovement(movement.type)
        ? -movement.amountMinor
        : movement.amountMinor,
    ),
  );
  const remaining = amountMinor - allocated - movementOutflow;
  return (remaining > 0n ? remaining : 0n).toString();
}

export function financeReportRow(
  input: Partial<FinanceReportRow> &
    Pick<FinanceReportRow, "recordType" | "reference" | "description">,
): FinanceReportRow {
  return {
    recordType: input.recordType,
    reference: input.reference,
    date: input.date ?? null,
    payerName: input.payerName ?? null,
    status: input.status ?? "—",
    amountMinor: input.amountMinor ?? null,
    currency: input.currency ?? null,
    description: input.description,
    dueDate: input.dueDate ?? null,
    outstandingMinor: input.outstandingMinor ?? null,
    ageingBucket: input.ageingBucket ?? null,
    overdueDays: input.overdueDays ?? null,
    feeMinor: input.feeMinor ?? null,
    payoutStatus: input.payoutStatus ?? null,
  };
}

export function financeLocalDateKey(value: Date): string {
  return londonDateKey(value);
}

function isInPeriod(value: Date, start: Date, end: Date): boolean {
  return value >= start && value < end;
}

function isReturnMovement(type: string): boolean {
  return type === "REFUND_RETURN" || type === "DISPUTE_REINSTATEMENT";
}

function dateKeyUtc(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

function londonDateKey(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = new Map(parts.map(({ type, value: part }) => [type, part]));
  return `${values.get("year")}-${values.get("month")}-${values.get("day")}`;
}
