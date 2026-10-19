interface FinanceStatementMonthEndEndpoint {
  url: string;
  secret: string;
}

type DispatchEnvironment = Record<string, string | undefined>;

export function loadFinanceStatementMonthEndEndpoint(
  environment: DispatchEnvironment,
): FinanceStatementMonthEndEndpoint | undefined {
  const rawUrl = environment.FINANCE_STATEMENT_MONTH_END_URL?.trim();
  const secret = environment.FINANCE_STATEMENT_MONTH_END_SECRET?.trim();
  if (!rawUrl && !secret) return undefined;
  if (!rawUrl) {
    throw new Error("FINANCE_STATEMENT_MONTH_END_URL is required");
  }
  if (!secret) {
    throw new Error("FINANCE_STATEMENT_MONTH_END_SECRET is required");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("FINANCE_STATEMENT_MONTH_END_URL must be a valid URL");
  }
  if (
    url.protocol !== "https:" ||
    url.pathname !== "/internal/finance/statements/month-end" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "FINANCE_STATEMENT_MONTH_END_URL must target the secure Finance month-end endpoint",
    );
  }
  return { url: url.toString(), secret };
}

export function previousLondonMonth(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  const values = new Map(parts.map(({ type, value }) => [type, value]));
  const currentYear = Number(values.get("year"));
  const currentMonth = Number(values.get("month"));
  const previousYear = currentMonth === 1 ? currentYear - 1 : currentYear;
  const previousMonth = currentMonth === 1 ? 12 : currentMonth - 1;
  return `${previousYear.toString().padStart(4, "0")}-${previousMonth
    .toString()
    .padStart(2, "0")}`;
}
