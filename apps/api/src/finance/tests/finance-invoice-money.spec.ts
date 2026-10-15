import {
  calculateFinanceLine,
  calculateFinanceTotals,
} from "../domain/invoice-money";

describe("Finance invoice money", () => {
  it("calculates line net, tax and total from exact quantity and unit values", () => {
    const line = calculateFinanceLine({
      description: "Term fee",
      quantity: "1.250",
      unitAmountMinor: "1001",
      taxRateBasisPoints: 2000,
    });

    expect(line.netAmountMinor).toBe(1251n);
    expect(line.taxAmountMinor).toBe(250n);
    expect(line.totalMinor).toBe(1501n);
  });

  it("uses half-up rounding for both quantity and tax calculations", () => {
    const line = calculateFinanceLine({
      description: "Rounded fee",
      quantity: "0.500",
      unitAmountMinor: "1",
      taxRateBasisPoints: 5000,
    });

    expect(line.netAmountMinor).toBe(1n);
    expect(line.taxAmountMinor).toBe(1n);
  });

  it("sums totals with checked PostgreSQL bigint arithmetic", () => {
    const totals = calculateFinanceTotals([
      {
        description: "One",
        quantity: "1",
        unitAmountMinor: "100",
        taxRateBasisPoints: 0,
      },
      {
        description: "Two",
        quantity: "1",
        unitAmountMinor: "200",
        taxRateBasisPoints: 1000,
      },
    ]);

    expect(totals).toEqual({
      subtotalMinor: 300n,
      taxMinor: 20n,
      totalMinor: 320n,
    });
  });

  it.each([
    { quantity: "0", unitAmountMinor: "1", taxRateBasisPoints: 0 },
    { quantity: "-1", unitAmountMinor: "1", taxRateBasisPoints: 0 },
    { quantity: "1.0001", unitAmountMinor: "1", taxRateBasisPoints: 0 },
    { quantity: "1", unitAmountMinor: "-1", taxRateBasisPoints: 0 },
    { quantity: "1", unitAmountMinor: "1.5", taxRateBasisPoints: 0 },
    { quantity: "1", unitAmountMinor: "1", taxRateBasisPoints: 100001 },
  ])("rejects invalid financial line inputs: %o", (input) => {
    expect(() =>
      calculateFinanceLine({ description: "Invalid", ...input }),
    ).toThrow(RangeError);
  });
});
