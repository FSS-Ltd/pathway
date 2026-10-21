import { Prisma } from "@pathway/db";
import type { FinanceCurrency } from "@pathway/platform";
import { FinanceBalanceService } from "../finance-balance.service";

export interface FinanceStripeReceiptInvoice {
  id: string;
  financeProfileId: string;
  payerAccountId: string | null;
  status: "DRAFT" | "IN_REVIEW" | "ISSUED" | "VOID";
  currency: FinanceCurrency;
  totalMinor: bigint;
}

export async function recordConfirmedStripeReceipt(
  tx: Prisma.TransactionClient,
  balances: FinanceBalanceService,
  input: {
    tenantId: string;
    orgId: string;
    financeProfileId: string;
    invoice: FinanceStripeReceiptInvoice;
    amountMinor: bigint;
    currency: FinanceCurrency;
    source: "STRIPE_CARD" | "STRIPE_BACS";
    sourceReference: string;
    confirmedAt: Date;
  },
): Promise<{
  receiptId: string;
  allocatedMinor: bigint;
  unappliedMinor: bigint;
}> {
  if (!input.invoice.payerAccountId) {
    throw new Error("Finance Stripe invoice has no payer account");
  }
  const existing = await tx.financeReceipt.findFirst({
    where: {
      financeProfileId: input.financeProfileId,
      tenantId: input.tenantId,
      orgId: input.orgId,
      source: input.source,
      sourceReference: input.sourceReference,
    },
    select: {
      id: true,
      payerAccountId: true,
      amountMinor: true,
      currency: true,
      status: true,
      confirmedAt: true,
    },
  });

  if (existing) {
    if (
      existing.payerAccountId !== input.invoice.payerAccountId ||
      existing.amountMinor !== input.amountMinor ||
      existing.currency !== input.currency ||
      existing.status !== "CONFIRMED" ||
      !existing.confirmedAt
    ) {
      throw new Error("Existing Finance Stripe receipt does not match payment");
    }
    const allocations = await tx.financeReceiptAllocation.aggregate({
      where: {
        receiptId: existing.id,
        tenantId: input.tenantId,
        orgId: input.orgId,
      },
      _sum: { amountMinor: true },
    });
    const allocatedMinor = allocations._sum.amountMinor ?? 0n;
    return {
      receiptId: existing.id,
      allocatedMinor,
      unappliedMinor:
        input.amountMinor > allocatedMinor
          ? input.amountMinor - allocatedMinor
          : 0n,
    };
  }

  const receipt = await tx.financeReceipt.create({
    data: {
      financeProfileId: input.financeProfileId,
      payerAccountId: input.invoice.payerAccountId,
      tenantId: input.tenantId,
      orgId: input.orgId,
      amountMinor: input.amountMinor,
      currency: input.currency,
      source: input.source,
      sourceReference: input.sourceReference,
      status: "CONFIRMED",
      confirmedAt: input.confirmedAt,
    },
    select: { id: true },
  });

  let allocatedMinor = 0n;
  if (input.invoice.status === "ISSUED") {
    const balancesByInvoice = await balances.forInvoices(tx, input, [
      input.invoice,
    ]);
    const outstandingMinor = BigInt(
      balancesByInvoice.get(input.invoice.id)?.outstandingMinor ?? "0",
    );
    allocatedMinor =
      outstandingMinor < input.amountMinor
        ? outstandingMinor
        : input.amountMinor;
    if (allocatedMinor > 0n) {
      await tx.financeReceiptAllocation.create({
        data: {
          receiptId: receipt.id,
          invoiceId: input.invoice.id,
          tenantId: input.tenantId,
          orgId: input.orgId,
          amountMinor: allocatedMinor,
          createdByUserId: null,
        },
        select: { id: true },
      });
    }
  }

  return {
    receiptId: receipt.id,
    allocatedMinor,
    unappliedMinor: input.amountMinor - allocatedMinor,
  };
}
