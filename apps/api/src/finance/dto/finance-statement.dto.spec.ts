import {
  financePayerStatementRequestSchema,
  financeStatementMonthEndJobSchema,
  financeStatementRequestSchema,
} from "./finance-statement.dto";

describe("Finance statement request schemas", () => {
  it("requires an explicit offset and a closed date range of at most 366 days", () => {
    const result = financeStatementRequestSchema.safeParse({
      payerAccountId: "04b7d8c4-c891-4af8-9011-d5a403ce3296",
      periodStart: "2026-10-01T00:00:00+01:00",
      periodEnd: "2026-10-18T00:00:00+01:00",
    });
    expect(result.success).toBe(true);
    expect(
      financePayerStatementRequestSchema.safeParse({
        periodStart: "2026-10-01T00:00:00",
        periodEnd: "2026-10-18T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("rejects future, inverted, and overly long periods", () => {
    const payerAccountId = "04b7d8c4-c891-4af8-9011-d5a403ce3296";
    expect(
      financeStatementRequestSchema.safeParse({
        payerAccountId,
        periodStart: "2026-10-18T00:00:00Z",
        periodEnd: "2026-10-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      financeStatementRequestSchema.safeParse({
        payerAccountId,
        periodStart: "2025-01-01T00:00:00Z",
        periodEnd: "2026-10-01T00:00:00Z",
      }).success,
    ).toBe(false);
    expect(
      financeStatementRequestSchema.safeParse({
        payerAccountId,
        periodStart: "2026-10-19T00:00:00Z",
        periodEnd: "2026-10-20T00:00:00Z",
      }).success,
    ).toBe(false);
  });

  it("accepts a month-end job only for a canonical calendar month", () => {
    expect(
      financeStatementMonthEndJobSchema.safeParse({ month: "2026-09" }).success,
    ).toBe(true);
    expect(
      financeStatementMonthEndJobSchema.safeParse({ month: "2026-13" }).success,
    ).toBe(false);
    expect(
      financeStatementMonthEndJobSchema.safeParse({
        month: "2026-09",
        tenantId: "another-tenant",
      }).success,
    ).toBe(false);
  });
});
