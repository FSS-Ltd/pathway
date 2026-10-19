import { formatFinanceMoney } from "../finance-currency-format";

describe("formatFinanceMoney", () => {
  it("formats integer minor units without floating-point rounding", () => {
    expect(formatFinanceMoney("9007199254740993", "GBP")).toBe(
      "£90,071,992,547,409.93",
    );
  });

  it("keeps negative account balances signed", () => {
    expect(formatFinanceMoney("-1", "GBP")).toBe("-£0.01");
  });

  it.each([
    ["EUR", "€1,234.56"],
    ["CZK", "CZK\u00a01,234.56"],
    ["DKK", "DKK\u00a01,234.56"],
    ["HUF", "HUF\u00a01,234.56"],
    ["PLN", "PLN\u00a01,234.56"],
    ["RON", "RON\u00a01,234.56"],
    ["SEK", "SEK\u00a01,234.56"],
  ] as const)("formats %s", (currency, expected) => {
    expect(formatFinanceMoney("123456", currency)).toBe(expected);
  });
});
