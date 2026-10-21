import {
  financeCurrencyFractionDigits as getFinanceCurrencyFractionDigits,
  isFinanceCurrency,
} from "@pathway/platform";

export function formatFinanceMoney(
  minorUnits: string,
  currency: string | null | undefined,
): string {
  if (!currency || !/^-?\d+$/.test(minorUnits)) return "—";
  try {
    const amount = BigInt(minorUnits);
    const negative = amount < 0n;
    const absolute = negative ? -amount : amount;
    const fractionDigits = financeCurrencyFractionDigits(currency);
    const formatter = new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
    const unit = 10n ** BigInt(fractionDigits);
    const whole = absolute / unit;
    const fraction = String(absolute % unit).padStart(fractionDigits, "0");
    const parts = formatter.formatToParts(negative ? -1 : 1);
    const groupedWhole = new Intl.NumberFormat("en-GB", {
      maximumFractionDigits: 0,
    }).format(whole);
    return parts
      .map((part) => {
        if (part.type === "integer") return groupedWhole;
        if (part.type === "group") return "";
        if (part.type === "fraction") return fraction;
        return part.value;
      })
      .join("");
  } catch {
    return `${currency} ${minorUnits}`;
  }
}

export function financeCurrencyFractionDigits(currency: string): number {
  if (isFinanceCurrency(currency)) {
    return getFinanceCurrencyFractionDigits(currency);
  }
  return (
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}

export function parseFinanceMajorAmount(
  value: string,
  currency: string | null | undefined,
): string | null {
  if (!currency) return null;
  try {
    const fractionDigits = financeCurrencyFractionDigits(currency);
    const fractionPart =
      fractionDigits === 0 ? "" : `(?:\\.(\\d{1,${fractionDigits}}))?`;
    const match = new RegExp(`^(0|[1-9]\\d*)${fractionPart}$`).exec(
      value.trim(),
    );
    if (!match) return null;
    const scale = 10n ** BigInt(fractionDigits);
    const whole = BigInt(match[1] ?? "0");
    const fraction = BigInt(
      (match[2] ?? "").padEnd(fractionDigits, "0") || "0",
    );
    const amount = whole * scale + fraction;
    return amount > 0n ? amount.toString() : null;
  } catch {
    return null;
  }
}

export function formatFinanceDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeZone: "Europe/London",
  }).format(date);
}

export function formatFinanceDateTime(
  value: string | null | undefined,
): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/London",
  }).format(date);
}

export function currentFinanceFilters(): {
  from: string;
  to: string;
  asOf: string;
} {
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const parts = new Map(dateParts.map(({ type, value }) => [type, value]));
  const today = `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}`;
  return {
    from: `${parts.get("year")}-${parts.get("month")}-01`,
    to: today,
    asOf: today,
  };
}

export function londonMidnightIso(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const utcGuess = Date.UTC(year, month - 1, day);
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
  return new Date(utcGuess - (localAsUtc - utcGuess)).toISOString();
}

export function addDateDays(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days))
    .toISOString()
    .slice(0, 10);
}

export function fileFromBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}
