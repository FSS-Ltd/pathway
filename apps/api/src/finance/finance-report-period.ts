export const FINANCE_REPORT_TIME_ZONE = "Europe/London";

export interface FinanceReportPeriod {
  fromDate: string;
  toDate: string;
  asOfDate: string;
  periodStart: Date;
  periodEnd: Date;
  asOfCutoff: Date;
}

export function resolveFinanceReportPeriod(input: {
  from: string;
  to: string;
  asOf: string;
}): FinanceReportPeriod {
  const periodStart = londonMidnightUtc(input.from);
  const periodEnd = londonMidnightUtc(addDays(input.to, 1));
  const asOfCutoff = new Date(
    londonMidnightUtc(addDays(input.asOf, 1)).getTime() - 1,
  );
  return {
    fromDate: input.from,
    toDate: input.to,
    asOfDate: input.asOf,
    periodStart,
    periodEnd,
    asOfCutoff,
  };
}

function londonMidnightUtc(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: FINANCE_REPORT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(utcGuess);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  const localAsUtc = Date.UTC(
    Number(values.get("year")),
    Number(values.get("month")) - 1,
    Number(values.get("day")),
    Number(values.get("hour")),
    Number(values.get("minute")),
    Number(values.get("second")),
  );
  return new Date(utcGuess - (localAsUtc - utcGuess));
}

function addDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}
