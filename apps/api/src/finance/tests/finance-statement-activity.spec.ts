import type { Prisma } from "@pathway/db";
import { loadFinanceStatementActivity } from "../finance-statement-activity";

describe("loadFinanceStatementActivity", () => {
  it("reduces charges by the signed reversal when an invoice is voided", async () => {
    const issuedAt = new Date("2026-10-05T12:00:00.000Z");
    const voidedAt = new Date("2026-10-10T12:00:00.000Z");
    const invoiceFindMany = jest.fn().mockResolvedValue([
      {
        invoiceNumber: 17n,
        totalMinor: 8_000n,
        issuedAt,
        voidedAt,
        status: "VOID",
      },
    ]);
    const creditFindMany = jest.fn().mockResolvedValue([]);
    const allocationFindMany = jest.fn().mockResolvedValue([]);
    const reversalFindMany = jest.fn().mockResolvedValue([]);
    const tx = {
      financeInvoice: { findMany: invoiceFindMany },
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
      financeReceiptAllocationReversal: { findMany: reversalFindMany },
    } as unknown as Prisma.TransactionClient;

    const activity = await loadFinanceStatementActivity(
      tx,
      { tenantId: "tenant-1", orgId: "org-1" },
      "payer-1",
      {
        periodStart: new Date("2026-10-01T00:00:00.000Z"),
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        generatedAt: new Date("2026-11-02T00:00:00.000Z"),
      },
    );

    expect(activity.chargesMinor).toBe(8_000n);
    expect(activity.reversalsMinor).toBe(-8_000n);
    expect(activity.lines.map((line) => line.amountMinor)).toEqual([
      "8000",
      "-8000",
    ]);
  });

  it("excludes allocations that were confirmed after the statement period", async () => {
    const invoiceFindMany = jest.fn().mockResolvedValue([]);
    const creditFindMany = jest.fn().mockResolvedValue([]);
    const allocationFindMany = jest.fn().mockResolvedValue([]);
    const reversalFindMany = jest.fn().mockResolvedValue([]);
    const tx = {
      financeInvoice: { findMany: invoiceFindMany },
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
      financeReceiptAllocationReversal: { findMany: reversalFindMany },
    } as unknown as Prisma.TransactionClient;
    const period = {
      periodStart: new Date("2026-09-30T23:00:00.000Z"),
      periodEnd: new Date("2026-11-01T00:00:00.000Z"),
      generatedAt: new Date("2026-11-02T12:00:00.000Z"),
    };

    await loadFinanceStatementActivity(
      tx,
      { tenantId: "tenant-1", orgId: "org-1" },
      "payer-1",
      period,
    );

    const allocationWhere = allocationFindMany.mock.calls[0][0].where;
    const reversalWhere = reversalFindMany.mock.calls[0][0].where;
    expect(allocationWhere.receipt.is.confirmedAt).toEqual({
      lt: period.periodEnd,
      lte: period.generatedAt,
    });
    expect(reversalWhere.allocation.is.receipt.is.confirmedAt).toEqual({
      lt: period.periodEnd,
      lte: period.generatedAt,
    });
  });
});
