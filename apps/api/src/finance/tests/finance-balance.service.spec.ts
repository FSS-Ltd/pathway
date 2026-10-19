import type { Prisma } from "@pathway/db";
import { FinanceBalanceService } from "../finance-balance.service";

describe("FinanceBalanceService historical allocation cutoffs", () => {
  const actor = { tenantId: "tenant-1", orgId: "org-1" };
  const invoice = {
    id: "invoice-1",
    status: "ISSUED" as const,
    totalMinor: 5_000n,
    issuedAt: new Date("2026-10-01T09:00:00.000Z"),
    createdAt: new Date("2026-10-01T09:00:00.000Z"),
  };

  it.each([
    {
      label: "the historical as-of date",
      asOf: new Date("2026-10-31T23:59:59.999Z"),
      ledgerCutoff: new Date("2026-11-02T12:00:00.000Z"),
      expectedCutoff: new Date("2026-10-31T23:59:59.999Z"),
    },
    {
      label: "the immutable ledger cutoff",
      asOf: new Date("2026-11-02T12:00:00.000Z"),
      ledgerCutoff: new Date("2026-11-01T00:00:00.000Z"),
      expectedCutoff: new Date("2026-11-01T00:00:00.000Z"),
    },
  ])("limits allocations and reversals to $label", async (testCase) => {
    const allocationFindMany = jest.fn().mockResolvedValue([]);
    const creditFindMany = jest.fn().mockResolvedValue([]);
    const movementApplicationFindMany = jest.fn().mockResolvedValue([]);
    const tx = {
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
      financeReceiptMovementApplication: {
        findMany: movementApplicationFindMany,
      },
    } as unknown as Prisma.TransactionClient;

    await new FinanceBalanceService().forInvoices(
      tx,
      actor,
      [invoice],
      testCase.asOf,
      testCase.ledgerCutoff,
    );

    const allocationWhere = allocationFindMany.mock.calls[0][0].where;
    expect(allocationWhere.createdAt).toEqual({
      lte: testCase.expectedCutoff,
    });
    expect(allocationFindMany.mock.calls[0][0].select.reversals.where).toEqual({
      createdAt: { lte: testCase.expectedCutoff },
    });
    expect(
      movementApplicationFindMany.mock.calls[0][0].where.movement.is,
    ).toMatchObject({
      occurredAt: { lte: testCase.expectedCutoff },
      createdAt: { lte: testCase.ledgerCutoff },
    });
    expect(
      movementApplicationFindMany.mock.calls[0][0].where.createdAt,
    ).toEqual({ lte: testCase.ledgerCutoff });
  });

  it("subtracts confirmed refunds from the invoice's allocated receipts", async () => {
    const tx = {
      financeCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocation: {
        findMany: jest.fn().mockResolvedValue([
          {
            invoiceId: invoice.id,
            amountMinor: 5_000n,
            reversals: [],
          },
        ]),
      },
      financeReceiptMovementApplication: {
        findMany: jest.fn().mockResolvedValue([
          {
            invoiceId: invoice.id,
            amountMinor: 1_250n,
            movement: { type: "REFUND" },
          },
          {
            invoiceId: invoice.id,
            amountMinor: 250n,
            movement: { type: "REFUND_RETURN" },
          },
        ]),
      },
    } as unknown as Prisma.TransactionClient;

    const balances = await new FinanceBalanceService().forInvoices(tx, actor, [
      invoice,
    ]);

    expect(balances.get(invoice.id)).toEqual({
      issuedGrossMinor: "5000",
      issuedCreditsMinor: "0",
      allocatedReceiptsMinor: "4000",
      outstandingMinor: "1000",
      creditBalanceMinor: "0",
    });
  });
});
