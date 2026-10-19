export interface FinanceStatementPeriod {
  periodStart: Date;
  periodEnd: Date;
}

export function londonMonthPeriod(value: string): FinanceStatementPeriod {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(value);
  if (!match) throw new RangeError("Finance month must use YYYY-MM");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    periodStart: londonMidnightUtc(year, month),
    periodEnd: londonMidnightUtc(nextYear, nextMonth),
  };
}

function londonMidnightUtc(year: number, month: number): Date {
  const utcGuess = Date.UTC(year, month - 1, 1);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
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
