import {
  ageingBucket,
  calculateFinanceReportTotals,
  netAllocationMinor,
  sumMinorUnits,
} from "../finance-report-projection";
import { resolveFinanceReportPeriod } from "../finance-report-period";

describe("Finance report projections", () => {
  it.each([
    ["2026-06-03T12:00:00.000Z", "2026-06-03", "NOT_YET_DUE", 0],
    ["2026-06-02T23:00:00.000Z", "2026-06-04", "DAYS_1_TO_30", 1],
    ["2026-05-03T23:00:00.000Z", "2026-06-03", "DAYS_1_TO_30", 30],
    ["2026-05-02T23:00:00.000Z", "2026-06-03", "DAYS_31_TO_60", 31],
    ["2026-03-04T00:00:00.000Z", "2026-06-03", "OVER_90_DAYS", 91],
  ] as const)(
    "ages a due date using the Europe/London calendar date",
    (dueAt, asOfDate, bucket, overdueDays) => {
      expect(ageingBucket(new Date(dueAt), asOfDate)).toEqual({
        bucket,
        overdueDays,
      });
    },
  );

  it("sums exact integer minor units", () => {
    expect(sumMinorUnits([9007199254740993n, 7n])).toBe(9007199254741000n);
  });

  it("nets allocation reversals and rejects reversals above the allocation", () => {
    expect(netAllocationMinor(500n, 125n)).toBe(375n);
    expect(() => netAllocationMinor(100n, 101n)).toThrow(
      "Finance allocation reversals exceed the allocation",
    );
  });

  it("reconciles issued charges, receipts, movements, allocations and balances", () => {
    const period = resolveFinanceReportPeriod({
      from: "2026-10-01",
      to: "2026-10-31",
      asOf: "2026-10-31",
    });
    const invoice = {
      id: "invoice-1",
      invoiceNumber: 41n,
      status: "ISSUED",
      currency: "GBP",
      totalMinor: 10_000n,
      issuedAt: new Date("2026-10-01T09:00:00.000Z"),
      dueAt: new Date("2026-10-15T12:00:00.000Z"),
      voidedAt: null,
      createdAt: new Date("2026-10-01T09:00:00.000Z"),
      payerNameSnapshot: "Family Example",
      balance: {
        outstandingMinor: "6000",
        issuedCreditsMinor: "1000",
        allocatedReceiptsMinor: "3000",
      },
    };

    expect(
      calculateFinanceReportTotals({
        invoices: [invoice],
        periodCredits: [{ totalMinor: 1_000n }],
        periodReceipts: [{ amountMinor: 4_000n }],
        periodMovements: [
          { type: "REFUND", amountMinor: 500n },
          { type: "REFUND_RETURN", amountMinor: 100n },
        ],
        periodAllocations: [
          { amountMinor: 4_000n, reversals: [{ amountMinor: 500n }] },
        ],
        confirmedReceipts: [
          {
            amountMinor: 4_000n,
            movements: [
              { type: "REFUND", amountMinor: 500n },
              { type: "REFUND_RETURN", amountMinor: 100n },
            ],
            allocations: [
              {
                amountMinor: 4_000n,
                reversals: [{ amountMinor: 500n }],
                movementApplications: [],
              },
            ],
          },
        ],
        processingReceipts: [],
        pendingManualReceipts: [],
        pendingRefunds: [],
        failedReceipts: [],
        transferNotices: [],
        period,
      }),
    ).toEqual({
      issuedGrossMinor: "10000",
      creditsMinor: "1000",
      confirmedReceiptsMinor: "4000",
      refundsMinor: "500",
      returnsMinor: "100",
      refundsAndReturnsMinor: "600",
      allocatedReceiptsMinor: "3500",
      outstandingMinor: "6000",
      overdueMinor: "6000",
      unappliedMinor: "100",
      processingMinor: "0",
      reviewRequiredMinor: "100",
    });
  });
});
