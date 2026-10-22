import {
  formatFinanceAmount,
  minorToMajorInput,
  parseMajorAmountToMinor,
} from "./family-finance-money";

describe("Family Finance amount formatting", () => {
  it("parses decimal input into integer currency minor units", () => {
    expect(parseMajorAmountToMinor("123.45", "GBP")).toBe("12345");
    expect(parseMajorAmountToMinor("0.4", "EUR")).toBe("40");
    expect(parseMajorAmountToMinor("125", "JPY")).toBe("125");
  });

  it("rejects malformed, zero, and over-precision amounts", () => {
    expect(parseMajorAmountToMinor("0", "GBP")).toBeNull();
    expect(parseMajorAmountToMinor("1.234", "GBP")).toBeNull();
    expect(parseMajorAmountToMinor("1,000.00", "GBP")).toBeNull();
    expect(parseMajorAmountToMinor("-2.00", "GBP")).toBeNull();
  });

  it("round trips supported currency precision without floating point math", () => {
    expect(minorToMajorInput("12345", "GBP")).toBe("123.45");
    expect(minorToMajorInput("40", "EUR")).toBe("0.40");
    expect(minorToMajorInput("125", "JPY")).toBe("125");
  });

  it("formats integer minor units using their currency", () => {
    expect(formatFinanceAmount("12345", "GBP")).toBe("£123.45");
    expect(formatFinanceAmount("40", "EUR")).toContain("0.40");
    expect(formatFinanceAmount("900719925474099199", "GBP")).toBe(
      "£9,007,199,254,740,991.99",
    );
  });
});
