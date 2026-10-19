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
    const tx = {
      financeCreditNote: { findMany: creditFindMany },
      financeReceiptAllocation: { findMany: allocationFindMany },
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
  });
});
