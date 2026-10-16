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
  ): Promise<Map<string, FinanceInvoiceBalance>> {
    const issued = invoices.filter((invoice) => invoice.status === "ISSUED");
    const balances = new Map<string, FinanceInvoiceBalance>();
    for (const invoice of invoices) balances.set(invoice.id, zeroBalance);
    if (issued.length === 0) return balances;

    const invoiceIds = issued.map(({ id }) => id);
    const [credits, allocations] = await Promise.all([
      tx.financeCreditNote.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          invoiceId: { in: invoiceIds },
          status: "ISSUED",
        },
        select: { invoiceId: true, totalMinor: true },
      }),
      tx.financeReceiptAllocation.findMany({
        where: {
          tenantId: actor.tenantId,
          orgId: actor.orgId,
          invoiceId: { in: invoiceIds },
          receipt: { is: { status: "CONFIRMED" } },
        },
        select: {
          invoiceId: true,
          amountMinor: true,
          reversals: { select: { amountMinor: true } },
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

    for (const invoice of issued) {
      const issuedCredits = creditsByInvoice.get(invoice.id) ?? 0n;
      const netCharges = invoice.totalMinor - issuedCredits;
      if (netCharges < 0n) {
        throw new Error("Finance credits exceed the issued invoice amount");
      }
      const allocatedReceipts = allocationsByInvoice.get(invoice.id) ?? 0n;
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
}
