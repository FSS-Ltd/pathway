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
      financeReceiptMovement: { findMany: jest.fn().mockResolvedValue([]) },
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
    expect(accountBalanceAt.mock.calls[0]?.[3]).toEqual(
      new Date("2026-09-30T22:59:59.999Z"),
    );
    expect(accountBalanceAt.mock.calls[0]?.[4]).toEqual(
      new Date("2026-09-30T22:59:59.999Z"),
    );
    expect(
      receiptFindMany.mock.calls[0][0].select.allocations.select
        .movementApplications.where.createdAt,
    ).toEqual({ lte: new Date("2026-11-02T12:00:00.000Z") });
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

  it("reduces closing unapplied funds by a confirmed refund from unapplied cash", async () => {
    const accountBalanceAt = jest
      .fn<
        ReturnType<FinanceBalanceService["accountBalanceAt"]>,
        Parameters<FinanceBalanceService["accountBalanceAt"]>
      >()
      .mockResolvedValue("0");
    const tx = {
      financeInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      financeCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocationReversal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      financeReceipt: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: "receipt-1", amountMinor: 1_000n, allocations: [] },
          ])
          .mockResolvedValueOnce([]),
      },
      financeReceiptMovement: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([
            {
              receiptId: "receipt-1",
              amountMinor: 250n,
              type: "REFUND",
            },
          ]),
      },
    } as unknown as Prisma.TransactionClient;
    const periodStart = new Date("2026-09-30T23:00:00.000Z");
    const periodEnd = new Date("2026-11-01T00:00:00.000Z");

    const snapshot = await buildFinanceStatementSnapshot(
      tx,
      { accountBalanceAt } as unknown as FinanceBalanceService,
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

    expect(snapshot.totals.unappliedFundsMinor).toBe("750");
  });

  it("reports outflows that exceed the receipt without failing the statement", async () => {
    const accountBalanceAt = jest
      .fn<
        ReturnType<FinanceBalanceService["accountBalanceAt"]>,
        Parameters<FinanceBalanceService["accountBalanceAt"]>
      >()
      .mockResolvedValue("0");
    const tx = {
      financeInvoice: { findMany: jest.fn().mockResolvedValue([]) },
      financeCreditNote: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocation: { findMany: jest.fn().mockResolvedValue([]) },
      financeReceiptAllocationReversal: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      financeReceipt: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            { id: "receipt-1", amountMinor: 1_000n, allocations: [] },
          ])
          .mockResolvedValueOnce([]),
      },
      financeReceiptMovement: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              type: "DISPUTE_WITHDRAWAL",
              source: "STRIPE",
              sourceReference: "du_disputed",
              amountMinor: 1_500n,
              currency: "GBP",
              occurredAt: new Date("2026-10-12T12:00:00.000Z"),
              createdAt: new Date("2026-10-12T12:00:00.000Z"),
              applications: [],
            },
          ])
          .mockResolvedValueOnce([
            {
              receiptId: "receipt-1",
              amountMinor: 1_500n,
              type: "DISPUTE_WITHDRAWAL",
            },
          ]),
      },
    } as unknown as Prisma.TransactionClient;

    const snapshot = await buildFinanceStatementSnapshot(
      tx,
      { accountBalanceAt } as unknown as FinanceBalanceService,
      { tenantId: "tenant-1", orgId: "org-1" },
      {
        payerAccountId: "payer-1",
        payerName: "Family account",
        legalEntityName: "Example School",
        currency: "GBP",
        periodStart: new Date("2026-09-30T23:00:00.000Z"),
        periodEnd: new Date("2026-11-01T00:00:00.000Z"),
        generatedAt: new Date("2026-11-02T12:00:00.000Z"),
      },
    );

    expect(snapshot.totals.unappliedFundsMinor).toBe("0");
    expect(snapshot.totals).toMatchObject({ uncoveredOutflowsMinor: "500" });
  });
});
