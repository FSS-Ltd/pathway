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
    const movementFindMany = jest.fn().mockResolvedValue([
      {
        type: "REFUND",
        source: "STRIPE",
        sourceReference: "re_1",
        amountMinor: 500n,
        currency: "GBP",
        occurredAt: new Date("2026-10-12T12:00:00.000Z"),
        applications: [{ amountMinor: 500n, invoice: { invoiceNumber: 17n } }],
      },
      {
        type: "REFUND_RETURN",
        source: "STRIPE",
        sourceReference: "re_1",
        amountMinor: 500n,
        currency: "GBP",
        occurredAt: new Date("2026-10-18T12:00:00.000Z"),
        applications: [{ amountMinor: 500n, invoice: { invoiceNumber: 17n } }],
      },
    ]);
    const tx = {
      financeInvoice: { findMany: invoiceFindMany },
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
      financeReceiptAllocationReversal: { findMany: reversalFindMany },
      financeReceiptMovement: { findMany: movementFindMany },
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
      "500",
      "-500",
    ]);
  });

  it("excludes allocations that were confirmed after the statement period", async () => {
    const invoiceFindMany = jest.fn().mockResolvedValue([]);
    const creditFindMany = jest.fn().mockResolvedValue([]);
    const allocationFindMany = jest.fn().mockResolvedValue([]);
    const reversalFindMany = jest.fn().mockResolvedValue([]);
    const movementFindMany = jest.fn().mockResolvedValue([]);
    const tx = {
      financeInvoice: { findMany: invoiceFindMany },
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
      financeReceiptAllocationReversal: { findMany: reversalFindMany },
      financeReceiptMovement: { findMany: movementFindMany },
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

  it("shows a late-posted prior-period movement as an adjustment in this period", async () => {
    const createdAt = new Date("2026-10-18T12:00:00.000Z");
    const occurredAt = new Date("2026-09-28T12:00:00.000Z");
    const invoiceFindMany = jest.fn().mockResolvedValue([]);
    const creditFindMany = jest.fn().mockResolvedValue([]);
    const allocationFindMany = jest.fn().mockResolvedValue([]);
    const reversalFindMany = jest.fn().mockResolvedValue([]);
    const movementFindMany = jest.fn().mockResolvedValue([
      {
        type: "DISPUTE_WITHDRAWAL",
        source: "STRIPE",
        sourceReference: "du_late",
        amountMinor: 500n,
        currency: "GBP",
        occurredAt,
        createdAt,
        applications: [],
      },
    ]);
    const tx = {
      financeInvoice: { findMany: invoiceFindMany },
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
      financeReceiptAllocationReversal: { findMany: reversalFindMany },
      financeReceiptMovement: { findMany: movementFindMany },
    } as unknown as Prisma.TransactionClient;
    const periodStart = new Date("2026-10-01T00:00:00.000Z");
    const periodEnd = new Date("2026-11-01T00:00:00.000Z");

    const activity = await loadFinanceStatementActivity(
      tx,
      { tenantId: "tenant-1", orgId: "org-1" },
      "payer-1",
      {
        periodStart,
        periodEnd,
        generatedAt: new Date("2026-11-02T00:00:00.000Z"),
      },
    );

    expect(movementFindMany.mock.calls[0]?.[0].where.OR).toEqual([
      {
        occurredAt: {
          gte: periodStart,
          lt: periodEnd,
          lte: new Date("2026-11-02T00:00:00.000Z"),
        },
      },
      {
        createdAt: {
          gte: periodStart,
          lt: periodEnd,
          lte: new Date("2026-11-02T00:00:00.000Z"),
        },
      },
    ]);
    expect(activity.lines[0]).toMatchObject({
      date: createdAt.toISOString(),
      description: expect.stringContaining("late"),
      amountMinor: "500",
    });
  });
});
