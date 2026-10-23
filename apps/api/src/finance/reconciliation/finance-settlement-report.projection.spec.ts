import { projectFinanceSettlementReport } from "./finance-settlement-report.projection";
import type { FinanceSettlementReportInput } from "./finance-settlement-report.types";
const now = new Date("2026-10-23T12:00:00Z");
const balance = (id: string, currency: string, fee: number) => ({
  id,
  object: "balance_transaction",
  created: 1,
  amount: 100,
  fee,
  net: 100 - fee,
  currency,
  type: "charge",
  source: "ch_one",
  available_on: 2,
  status: "available",
});
function input(): FinanceSettlementReportInput {
  return {
    connection: {
      id: "connection_one",
      accountId: "acct_school",
      livemode: false,
    },
    generatedAt: now,
    periodEnd: now,
    balanceEvidence: [],
    payoutEvidence: [],
    streams: ["balanceTransactions", "payouts"].map((stream) => ({
      stream,
      completedThrough: now,
      lastSucceededAt: now,
      windowFrom: null,
      windowTo: null,
      lastError: null,
    })),
    truncated: false,
  };
}
describe("persisted settlement report projection", () => {
  it("keeps fee totals in their actual currencies and never claims historical start coverage", () => {
    const data = input();
    data.balanceEvidence = [
      { facts: balance("txn_eur", "eur", 10), observedAt: now },
      { facts: balance("txn_gbp", "gbp", 20), observedAt: now },
    ];
    expect(projectFinanceSettlementReport(data)).toMatchObject({
      source: "PERSISTED_RECONCILIATION",
      freshness: "CURRENT",
      fetchedAt: now.toISOString(),
      periodStartCoverage: "UNPROVEN",
      feesByCurrency: [
        { currency: "EUR", amountMinor: "10" },
        { currency: "GBP", amountMinor: "20" },
      ],
    });
  });
  it("distinguishes missing, failed/partial, stale and truncated coverage", () => {
    expect(
      projectFinanceSettlementReport({ ...input(), streams: [] }).freshness,
    ).toBe("NOT_SYNCED");
    expect(
      projectFinanceSettlementReport({
        ...input(),
        streams: input().streams.map((row) => ({
          ...row,
          lastError: "UNAVAILABLE",
        })),
      }).freshness,
    ).toBe("INCOMPLETE");
    expect(
      projectFinanceSettlementReport({
        ...input(),
        generatedAt: new Date(now.getTime() + 37 * 3600000),
        periodEnd: now,
      }).freshness,
    ).toBe("STALE");
    expect(
      projectFinanceSettlementReport({ ...input(), truncated: true }).freshness,
    ).toBe("INCOMPLETE");
  });
  it("refuses mixed environment evidence instead of merging accounts", () => {
    const data = input();
    data.balanceEvidence = [
      {
        facts: { ...balance("txn_one", "eur", 10), livemode: true },
        observedAt: now,
      },
    ];
    expect(() => projectFinanceSettlementReport(data)).toThrow();
  });
});
