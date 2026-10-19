import type { Prisma } from "@pathway/db";
import { addMinorUnits } from "./domain/minor-units";
import type {
  FinanceStatementLine,
  FinanceStatementScope,
} from "./finance-statement-snapshot-schema";

export interface FinanceStatementActivity {
  chargesMinor: bigint;
  creditsMinor: bigint;
  allocationsMinor: bigint;
  reversalsMinor: bigint;
  lines: FinanceStatementLine[];
}

export async function loadFinanceStatementActivity(
  tx: Prisma.TransactionClient,
  scope: FinanceStatementScope,
  payerAccountId: string,
  period: { periodStart: Date; periodEnd: Date; generatedAt: Date },
): Promise<FinanceStatementActivity> {
  const range = {
    gte: period.periodStart,
    lt: period.periodEnd,
    lte: period.generatedAt,
  };
  const [invoices, credits, allocations, reversals, movements] =
    await Promise.all([
      tx.financeInvoice.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          payerAccountId,
          status: { in: ["ISSUED", "VOID"] },
          createdAt: { lte: period.generatedAt },
          OR: [{ issuedAt: range }, { voidedAt: range }],
        },
        select: {
          invoiceNumber: true,
          totalMinor: true,
          issuedAt: true,
          voidedAt: true,
          status: true,
        },
      }),
      tx.financeCreditNote.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          invoice: { is: { payerAccountId } },
          status: { in: ["ISSUED", "VOID"] },
          createdAt: { lte: period.generatedAt },
          OR: [{ issuedAt: range }, { voidedAt: range }],
        },
        select: {
          creditNumber: true,
          totalMinor: true,
          issuedAt: true,
          voidedAt: true,
          status: true,
        },
      }),
      tx.financeReceiptAllocation.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          createdAt: range,
          invoice: { is: { payerAccountId } },
          receipt: {
            is: {
              payerAccountId,
              status: "CONFIRMED",
              createdAt: { lte: period.generatedAt },
              confirmedAt: { lt: period.periodEnd, lte: period.generatedAt },
            },
          },
        },
        select: {
          amountMinor: true,
          createdAt: true,
          invoice: { select: { invoiceNumber: true } },
        },
      }),
      tx.financeReceiptAllocationReversal.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          createdAt: range,
          allocation: {
            is: {
              invoice: { is: { payerAccountId } },
              receipt: {
                is: {
                  payerAccountId,
                  status: "CONFIRMED",
                  createdAt: { lte: period.generatedAt },
                  confirmedAt: {
                    lt: period.periodEnd,
                    lte: period.generatedAt,
                  },
                },
              },
            },
          },
        },
        select: {
          amountMinor: true,
          createdAt: true,
          reason: true,
          allocation: {
            select: { invoice: { select: { invoiceNumber: true } } },
          },
        },
      }),
      tx.financeReceiptMovement.findMany({
        where: {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          occurredAt: { lte: period.generatedAt },
          createdAt: { lte: period.generatedAt },
          OR: [
            { occurredAt: range },
            {
              createdAt: {
                gte: period.periodStart,
                lt: period.periodEnd,
                lte: period.generatedAt,
              },
            },
          ],
          receipt: { is: { payerAccountId } },
        },
        select: {
          type: true,
          source: true,
          sourceReference: true,
          amountMinor: true,
          currency: true,
          occurredAt: true,
          createdAt: true,
          applications: {
            where: { createdAt: { lte: period.generatedAt } },
            select: {
              amountMinor: true,
              invoice: { select: { invoiceNumber: true } },
            },
          },
        },
      }),
    ]);

  let chargesMinor = 0n;
  let creditsMinor = 0n;
  let allocationsMinor = 0n;
  let reversalsMinor = 0n;
  const lines: FinanceStatementLine[] = [];
  for (const invoice of invoices) {
    if (isInPeriod(invoice.issuedAt, period)) {
      chargesMinor = addMinorUnits(chargesMinor, invoice.totalMinor);
      lines.push({
        date: invoice.issuedAt.toISOString(),
        reference: `INV-${invoice.invoiceNumber?.toString() ?? "pending"}`,
        description: "Invoice issued",
        amountMinor: invoice.totalMinor.toString(),
      });
    }
    if (invoice.status === "VOID" && isInPeriod(invoice.voidedAt, period)) {
      reversalsMinor = addMinorUnits(reversalsMinor, -invoice.totalMinor);
      lines.push({
        date: invoice.voidedAt.toISOString(),
        reference: `INV-${invoice.invoiceNumber?.toString() ?? "pending"}`,
        description: "Invoice voided",
        amountMinor: (-invoice.totalMinor).toString(),
      });
    }
  }
  for (const credit of credits) {
    if (isInPeriod(credit.issuedAt, period)) {
      creditsMinor = addMinorUnits(creditsMinor, credit.totalMinor);
      lines.push({
        date: credit.issuedAt.toISOString(),
        reference: `CN-${credit.creditNumber?.toString() ?? "pending"}`,
        description: "Credit issued",
        amountMinor: (-credit.totalMinor).toString(),
      });
    }
    if (credit.status === "VOID" && isInPeriod(credit.voidedAt, period)) {
      reversalsMinor = addMinorUnits(reversalsMinor, credit.totalMinor);
      lines.push({
        date: credit.voidedAt.toISOString(),
        reference: `CN-${credit.creditNumber?.toString() ?? "pending"}`,
        description: "Credit voided",
        amountMinor: credit.totalMinor.toString(),
      });
    }
  }
  for (const allocation of allocations) {
    allocationsMinor = addMinorUnits(allocationsMinor, allocation.amountMinor);
    lines.push({
      date: allocation.createdAt.toISOString(),
      reference: `INV-${allocation.invoice.invoiceNumber?.toString() ?? "pending"}`,
      description: "Confirmed receipt allocated",
      amountMinor: (-allocation.amountMinor).toString(),
    });
  }
  for (const reversal of reversals) {
    reversalsMinor = addMinorUnits(reversalsMinor, reversal.amountMinor);
    lines.push({
      date: reversal.createdAt.toISOString(),
      reference: `INV-${reversal.allocation.invoice.invoiceNumber?.toString() ?? "pending"}`,
      description: `Allocation reversed: ${reversal.reason}`,
      amountMinor: reversal.amountMinor.toString(),
    });
  }
  for (const movement of movements) {
    const isReturn =
      movement.type === "REFUND_RETURN" ||
      movement.type === "DISPUTE_REINSTATEMENT";
    const direction = isReturn ? -1n : 1n;
    const amountByInvoice = new Map<string, bigint>();
    for (const application of movement.applications) {
      const invoiceNumber =
        application.invoice.invoiceNumber?.toString() ?? "pending";
      amountByInvoice.set(
        invoiceNumber,
        addMinorUnits(
          amountByInvoice.get(invoiceNumber) ?? 0n,
          application.amountMinor,
        ),
      );
    }
    const appliedMinor = [...amountByInvoice.values()].reduce(
      (sum, amountMinor) => addMinorUnits(sum, amountMinor),
      0n,
    );
    const unappliedMinor = movement.amountMinor - appliedMinor;
    const occurredInPeriod =
      movement.occurredAt >= period.periodStart &&
      movement.occurredAt < period.periodEnd &&
      movement.occurredAt <= period.generatedAt;
    const movementDate = occurredInPeriod
      ? movement.occurredAt
      : movement.createdAt;
    const lateDescription = occurredInPeriod
      ? ""
      : ` recorded late (occurred ${movement.occurredAt.toISOString()})`;
    if (amountByInvoice.size === 0) {
      const sourceLabel = movement.source === "STRIPE" ? "Stripe" : "bank";
      lines.push({
        date: movementDate.toISOString(),
        reference: `REC-${movement.sourceReference}`,
        description: `${sourceLabel} ${movementLabel(movement.type).toLowerCase()}${lateDescription} from unapplied or uncovered receipt funds`,
        amountMinor: (direction * movement.amountMinor).toString(),
      });
    } else {
      for (const [invoiceNumber, amountMinor] of amountByInvoice) {
        lines.push({
          date: movementDate.toISOString(),
          reference: `INV-${invoiceNumber}`,
          description: `${movementLabel(movement.type)} applied to invoice${lateDescription}`,
          amountMinor: (direction * amountMinor).toString(),
        });
      }
      if (unappliedMinor > 0n) {
        const sourceLabel = movement.source === "STRIPE" ? "Stripe" : "bank";
        lines.push({
          date: movementDate.toISOString(),
          reference: `REC-${movement.sourceReference}`,
          description: `${sourceLabel} ${movementLabel(movement.type).toLowerCase()}${lateDescription} from unapplied or uncovered receipt funds`,
          amountMinor: (direction * unappliedMinor).toString(),
        });
      }
    }
    reversalsMinor = addMinorUnits(reversalsMinor, direction * appliedMinor);
  }
  lines.sort((left, right) => left.date.localeCompare(right.date));
  return {
    chargesMinor,
    creditsMinor,
    allocationsMinor,
    reversalsMinor,
    lines,
  };
}

function movementLabel(
  type:
    | "REFUND"
    | "REFUND_RETURN"
    | "DISPUTE_WITHDRAWAL"
    | "DISPUTE_REINSTATEMENT",
): string {
  switch (type) {
    case "REFUND":
      return "Refund";
    case "REFUND_RETURN":
      return "Refund returned";
    case "DISPUTE_WITHDRAWAL":
      return "Dispute funds withdrawn";
    case "DISPUTE_REINSTATEMENT":
      return "Dispute funds reinstated";
  }
}

function isInPeriod(
  value: Date | null,
  period: { periodStart: Date; periodEnd: Date; generatedAt: Date },
): value is Date {
  return (
    value !== null &&
    value >= period.periodStart &&
    value < period.periodEnd &&
    value <= period.generatedAt
  );
}
