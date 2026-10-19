import { londonMonthPeriod } from "../finance-statement-period";

describe("londonMonthPeriod", () => {
  it("uses Europe/London boundaries across daylight saving time", () => {
    expect(londonMonthPeriod("2026-10")).toEqual({
      periodStart: new Date("2026-09-30T23:00:00.000Z"),
      periodEnd: new Date("2026-11-01T00:00:00.000Z"),
    });
  });

  it("rejects invalid months", () => {
    expect(() => londonMonthPeriod("2026-13")).toThrow(
      "Finance month must use YYYY-MM",
    );
  });
});
