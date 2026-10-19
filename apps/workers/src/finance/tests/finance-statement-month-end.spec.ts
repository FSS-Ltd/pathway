import {
  loadFinanceStatementMonthEndEndpoint,
  previousLondonMonth,
} from "../finance-statement-month-end";

describe("Finance statement month-end worker configuration", () => {
  it("requires the exact secure internal endpoint when configured", () => {
    expect(
      loadFinanceStatementMonthEndEndpoint({
        FINANCE_STATEMENT_MONTH_END_URL:
          "https://api.example.test/internal/finance/statements/month-end",
        FINANCE_STATEMENT_MONTH_END_SECRET: "job-secret",
      }),
    ).toEqual({
      url: "https://api.example.test/internal/finance/statements/month-end",
      secret: "job-secret",
    });
    expect(() =>
      loadFinanceStatementMonthEndEndpoint({
        FINANCE_STATEMENT_MONTH_END_URL:
          "http://api.example.test/internal/finance/statements/month-end",
        FINANCE_STATEMENT_MONTH_END_SECRET: "job-secret",
      }),
    ).toThrow("must target the secure Finance month-end endpoint");
  });

  it("rejects partial or unsafe endpoint configuration", () => {
    expect(() =>
      loadFinanceStatementMonthEndEndpoint({
        FINANCE_STATEMENT_MONTH_END_SECRET: "job-secret",
      }),
    ).toThrow("FINANCE_STATEMENT_MONTH_END_URL is required");
    expect(() =>
      loadFinanceStatementMonthEndEndpoint({
        FINANCE_STATEMENT_MONTH_END_URL:
          "https://api.example.test/internal/finance/statements/other",
        FINANCE_STATEMENT_MONTH_END_SECRET: "job-secret",
      }),
    ).toThrow("must target the secure Finance month-end endpoint");
  });
});

describe("previousLondonMonth", () => {
  it("uses the London calendar month across UTC month boundaries", () => {
    expect(previousLondonMonth(new Date("2026-11-01T00:30:00.000Z"))).toBe(
      "2026-10",
    );
    expect(previousLondonMonth(new Date("2026-01-31T23:30:00.000Z"))).toBe(
      "2025-12",
    );
  });
});
