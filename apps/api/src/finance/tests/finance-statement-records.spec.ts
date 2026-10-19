import type { FinanceStatementSnapshot } from "../finance-statement-snapshot-schema";
import { toFinanceStatementPdfInput } from "../finance-statement-records";

describe("toFinanceStatementPdfInput", () => {
  it("renders an exclusive period end as the final included date", () => {
    const snapshot: FinanceStatementSnapshot = {
      version: 1,
      currency: "GBP",
      payerName: "Family account",
      legalEntityName: "Example School",
      periodStart: "2026-09-30T23:00:00.000Z",
      periodEnd: "2026-11-01T00:00:00.000Z",
      generatedAt: "2026-11-02T12:00:00.000Z",
      ledgerCutoffAt: "2026-11-02T12:00:00.000Z",
      totals: {
        openingBalanceMinor: "0",
        chargesIssuedMinor: "0",
        creditsIssuedMinor: "0",
        allocatedReceiptsMinor: "0",
        reversalsMinor: "0",
        closingBalanceMinor: "0",
        unappliedFundsMinor: "0",
        processingFundsMinor: "0",
        uncoveredOutflowsMinor: "250",
      },
      lines: [],
    };

    const pdf = toFinanceStatementPdfInput(snapshot);

    expect(pdf.title).toBe("Statement 2026-10-01 to 2026-10-31");
    expect(pdf.periodEnd).toBe("2026-10-31T23:59:59.999Z");
    expect(pdf.totals).toContainEqual({
      label: "Uncovered receipt outflows",
      amountMinor: "250",
    });
  });
});
