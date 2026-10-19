import { Injectable } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import { addMinorUnits } from "./domain/minor-units";

export interface FinanceInvoiceBalance {
  issuedGrossMinor: string;
  issuedCreditsMinor: string;
  allocatedReceiptsMinor: string;
  outstandingMinor: string;
  creditBalanceMinor: string;
}

interface InvoiceBalanceInput {
  id: string;
  status: "DRAFT" | "IN_REVIEW" | "ISSUED" | "VOID";
  totalMinor: bigint;
  issuedAt?: Date | null;
  voidedAt?: Date | null;
  createdAt?: Date;
}

interface FinanceBalanceScope {
  tenantId: string;
  orgId: string;
}

const zeroBalance: FinanceInvoiceBalance = {
  issuedGrossMinor: "0",
  issuedCreditsMinor: "0",
  allocatedReceiptsMinor: "0",
  outstandingMinor: "0",
  creditBalanceMinor: "0",
};

@Injectable()
export class FinanceBalanceService {
  async forInvoices(
    tx: Prisma.TransactionClient,
    actor: FinanceBalanceScope,
    invoices: readonly InvoiceBalanceInput[],
    asOf?: Date,
    ledgerCutoff?: Date,
  ): Promise<Map<string, FinanceInvoiceBalance>> {
    const effectiveAsOf = earlierDate(asOf, ledgerCutoff);
    const issued = invoices.filter((invoice) =>
      isInvoiceIssuedAt(invoice, effectiveAsOf, ledgerCutoff),
    );
    const balances = new Map<string, FinanceInvoiceBalance>();
    for (const invoice of invoices) balances.set(invoice.id, zeroBalance);
    if (issued.length === 0) return balances;

    const invoiceIds = issued.map(({ id }) => id);
    const movementCutoff = earlierDate(asOf, ledgerCutoff);
    const movementApplicationCutoff = ledgerCutoff ?? movementCutoff;
    const [credits, allocations, receiptMovements] = await Promise.all([
      tx.financeCreditNote.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          invoiceId: { in: invoiceIds },
          ...(effectiveAsOf
            ? {
                issuedAt: { lte: effectiveAsOf },
                ...(ledgerCutoff ? { createdAt: { lte: ledgerCutoff } } : {}),
                OR: [
                  { status: "ISSUED" as const },
                  { status: "VOID" as const, voidedAt: { gt: effectiveAsOf } },
                ],
              }
            : { status: "ISSUED" as const }),
        },
        select: { invoiceId: true, totalMinor: true },
      }),
      tx.financeReceiptAllocation.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          invoiceId: { in: invoiceIds },
          ...(movementCutoff ? { createdAt: { lte: movementCutoff } } : {}),
          receipt: {
            is: {
              status: "CONFIRMED",
              ...(effectiveAsOf ? { confirmedAt: { lte: effectiveAsOf } } : {}),
            },
          },
        },
        select: {
          invoiceId: true,
          amountMinor: true,
          reversals: {
            where: movementCutoff
              ? { createdAt: { lte: movementCutoff } }
              : undefined,
            select: { amountMinor: true },
          },
        },
      }),
      tx.financeReceiptMovementApplication.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          invoiceId: { in: invoiceIds },
          ...(movementApplicationCutoff
            ? { createdAt: { lte: movementApplicationCutoff } }
            : {}),
          receiptAllocation: {
            is: {
              ...(movementCutoff ? { createdAt: { lte: movementCutoff } } : {}),
              receipt: {
                is: {
                  status: "CONFIRMED",
                  ...(effectiveAsOf
                    ? { confirmedAt: { lte: effectiveAsOf } }
                    : {}),
                },
              },
            },
          },
          movement: {
            is: {
              ...(effectiveAsOf ? { occurredAt: { lte: effectiveAsOf } } : {}),
              ...(ledgerCutoff ? { createdAt: { lte: ledgerCutoff } } : {}),
            },
          },
        },
        select: {
          invoiceId: true,
          amountMinor: true,
          movement: { select: { type: true } },
        },
      }),
    ]);

    const creditsByInvoice = new Map<string, bigint>();
    for (const credit of credits) {
      creditsByInvoice.set(
        credit.invoiceId,
        addMinorUnits(
          creditsByInvoice.get(credit.invoiceId) ?? 0n,
          credit.totalMinor,
        ),
      );
    }

    const allocationsByInvoice = new Map<string, bigint>();
    for (const allocation of allocations) {
      const reversedMinor = allocation.reversals.reduce(
        (sum, reversal) => addMinorUnits(sum, reversal.amountMinor),
        0n,
      );
      const netAmount = allocation.amountMinor - reversedMinor;
      if (netAmount < 0n) {
        throw new Error("Finance allocation reversals exceed the allocation");
      }
      allocationsByInvoice.set(
        allocation.invoiceId,
        addMinorUnits(
          allocationsByInvoice.get(allocation.invoiceId) ?? 0n,
          netAmount,
        ),
      );
    }

    const movementImpactByInvoice = new Map<string, bigint>();
    for (const application of receiptMovements) {
      const isReturn =
        application.movement.type === "REFUND_RETURN" ||
        application.movement.type === "DISPUTE_REINSTATEMENT";
      const impactMinor = isReturn
        ? -application.amountMinor
        : application.amountMinor;
      movementImpactByInvoice.set(
        application.invoiceId,
        addMinorUnits(
          movementImpactByInvoice.get(application.invoiceId) ?? 0n,
          impactMinor,
        ),
      );
    }

    for (const invoice of issued) {
      const issuedCredits = creditsByInvoice.get(invoice.id) ?? 0n;
      const netCharges = invoice.totalMinor - issuedCredits;
      if (netCharges < 0n) {
        throw new Error("Finance credits exceed the issued invoice amount");
      }
      const allocatedReceipts =
        (allocationsByInvoice.get(invoice.id) ?? 0n) -
        (movementImpactByInvoice.get(invoice.id) ?? 0n);
      const outstanding = netCharges - allocatedReceipts;
      balances.set(invoice.id, {
        issuedGrossMinor: invoice.totalMinor.toString(),
        issuedCreditsMinor: issuedCredits.toString(),
        allocatedReceiptsMinor: allocatedReceipts.toString(),
        outstandingMinor: (outstanding > 0n ? outstanding : 0n).toString(),
        creditBalanceMinor: (outstanding < 0n ? -outstanding : 0n).toString(),
      });
    }
    return balances;
  }

  async accountBalanceAt(
    tx: Prisma.TransactionClient,
    actor: FinanceBalanceScope,
    payerAccountId: string,
    asOf: Date,
    ledgerCutoff: Date = asOf,
  ): Promise<string> {
    const effectiveAsOf = earlierDate(asOf, ledgerCutoff);
    const invoices = await tx.financeInvoice.findMany({
      where: {
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        payerAccountId,
        status: { in: ["ISSUED", "VOID"] },
        issuedAt: { lte: effectiveAsOf },
        createdAt: { lte: ledgerCutoff },
      },
      select: {
        id: true,
        status: true,
        totalMinor: true,
        issuedAt: true,
        voidedAt: true,
        createdAt: true,
      },
    });
    const balances = await this.forInvoices(
      tx,
      actor,
      invoices,
      asOf,
      ledgerCutoff,
    );
    let balance = 0n;
    for (const invoiceBalance of balances.values()) {
      balance = addMinorUnits(
        balance,
        BigInt(invoiceBalance.outstandingMinor) -
          BigInt(invoiceBalance.creditBalanceMinor),
      );
    }
    return balance.toString();
  }
}

function earlierDate(left?: Date, right?: Date): Date | undefined {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function isInvoiceIssuedAt(
  invoice: InvoiceBalanceInput,
  asOf?: Date,
  ledgerCutoff?: Date,
): boolean {
  if (ledgerCutoff && invoice.createdAt && invoice.createdAt > ledgerCutoff) {
    return false;
  }
  if (!asOf) return invoice.status === "ISSUED";
  if (!invoice.issuedAt || invoice.issuedAt > asOf) return false;
  return (
    invoice.status === "ISSUED" ||
    (invoice.status === "VOID" &&
      invoice.voidedAt !== null &&
      invoice.voidedAt !== undefined &&
      invoice.voidedAt > asOf)
  );
}
