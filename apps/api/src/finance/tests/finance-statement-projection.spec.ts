import { buildFinanceStatementTotals } from "../finance-statement-projection";

describe("buildFinanceStatementTotals", () => {
  it("reconciles opening balance and period movements in integer minor units", () => {
    expect(
      buildFinanceStatementTotals({
        openingBalanceMinor: 12_500n,
        chargesIssuedMinor: 8_000n,
        creditsIssuedMinor: 1_000n,
        allocatedReceiptsMinor: 5_500n,
        reversalsMinor: 500n,
        unappliedFundsMinor: 2_000n,
        processingFundsMinor: 900n,
      }),
    ).toEqual({
      openingBalanceMinor: "12500",
      chargesIssuedMinor: "8000",
      creditsIssuedMinor: "1000",
      allocatedReceiptsMinor: "5500",
      reversalsMinor: "500",
      closingBalanceMinor: "14500",
      unappliedFundsMinor: "2000",
      processingFundsMinor: "900",
      uncoveredOutflowsMinor: "0",
    });
  });

  it("preserves a credit balance instead of clamping the closing balance", () => {
    expect(
      buildFinanceStatementTotals({
        openingBalanceMinor: 0n,
        chargesIssuedMinor: 0n,
        creditsIssuedMinor: 2_500n,
        allocatedReceiptsMinor: 0n,
        reversalsMinor: 0n,
        unappliedFundsMinor: 0n,
        processingFundsMinor: 0n,
      }).closingBalanceMinor,
    ).toBe("-2500");
  });

  it("subtracts a voided invoice reversal from the closing balance", () => {
    expect(
      buildFinanceStatementTotals({
        openingBalanceMinor: 0n,
        chargesIssuedMinor: 8_000n,
        creditsIssuedMinor: 0n,
        allocatedReceiptsMinor: 0n,
        reversalsMinor: -8_000n,
        unappliedFundsMinor: 0n,
        processingFundsMinor: 0n,
      }).closingBalanceMinor,
    ).toBe("0");
  });
});
