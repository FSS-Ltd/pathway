import { resolveFinanceReportPeriod } from "../finance-report-period";

describe("resolveFinanceReportPeriod", () => {
  it("uses the shorter Europe/London day when daylight saving time starts", () => {
    const period = resolveFinanceReportPeriod({
      from: "2026-03-29",
      to: "2026-03-29",
      asOf: "2026-03-29",
    });

    expect(period.periodStart.toISOString()).toBe("2026-03-29T00:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-03-29T23:00:00.000Z");
    expect(period.asOfCutoff.toISOString()).toBe("2026-03-29T22:59:59.999Z");
  });

  it("uses the longer Europe/London day when daylight saving time ends", () => {
    const period = resolveFinanceReportPeriod({
      from: "2026-10-25",
      to: "2026-10-25",
      asOf: "2026-10-25",
    });

    expect(period.periodStart.toISOString()).toBe("2026-10-24T23:00:00.000Z");
    expect(period.periodEnd.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    expect(period.asOfCutoff.toISOString()).toBe("2026-10-25T23:59:59.999Z");
  });
});
