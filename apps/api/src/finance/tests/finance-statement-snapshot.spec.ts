import type { Prisma } from "@pathway/db";
import type { FinanceBalanceService } from "../finance-balance.service";
import { buildFinanceStatementSnapshot } from "../finance-statement-snapshot";

describe("buildFinanceStatementSnapshot", () => {
  it("keeps receipts processing at period close separate from confirmed funds", async () => {
    const accountBalanceAt = jest
      .fn<
        ReturnType<FinanceBalanceService["accountBalanceAt"]>,
        Parameters<FinanceBalanceService["accountBalanceAt"]>
      >()
      .mockResolvedValue("0");
    const receiptFindMany = jest
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ amountMinor: 250n }]);
    const tx = {
      financeInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      financeCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocationReversal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      financeReceipt: { findMany: receiptFindMany },
    } as unknown as Prisma.TransactionClient;
    const balances = { accountBalanceAt } as unknown as FinanceBalanceService;
    const periodStart = new Date("2026-09-30T23:00:00.000Z");
    const periodEnd = new Date("2026-11-01T00:00:00.000Z");

    const snapshot = await buildFinanceStatementSnapshot(
      tx,
      balances,
      { tenantId: "tenant-1", orgId: "org-1" },
      {
        payerAccountId: "payer-1",
        payerName: "Family account",
        legalEntityName: "Example School",
        currency: "GBP",
        periodStart,
        periodEnd,
        generatedAt: new Date("2026-11-02T12:00:00.000Z"),
      },
    );

    expect(snapshot.totals.processingFundsMinor).toBe("250");
    expect(snapshot.totals.unappliedFundsMinor).toBe("0");
    expect(receiptFindMany.mock.calls[1][0].where).toMatchObject({
      createdAt: { lte: new Date("2026-10-31T23:59:59.999Z") },
      OR: [
        {
          status: "PROCESSING",
          updatedAt: { lte: new Date("2026-10-31T23:59:59.999Z") },
        },
        {
          status: { in: ["CONFIRMED", "FAILED"] },
          updatedAt: { gt: new Date("2026-10-31T23:59:59.999Z") },
        },
      ],
    });
  });
});
