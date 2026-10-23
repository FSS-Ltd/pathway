export function formatFinanceAmount(
  amountMinor: string,
  currency: string,
): string {
  const amount = BigInt(amountMinor);
  const isNegative = amount < 0n;
  const absolute = isNegative ? -amount : amount;
  const fractionDigits = currencyFractionDigits(currency);
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
  const unit = 10n ** BigInt(fractionDigits);
  // Hermes Intl rejects BigInt, and Number would lose precision for large
  // amounts. Group exact decimal digits using the formatter's en-GB convention.
  const whole = (absolute / unit)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const fraction = (absolute % unit).toString().padStart(fractionDigits, "0");
  const exactNumber = fractionDigits > 0 ? `${whole}.${fraction}` : whole;
  // Native Intl also lacks formatToParts. A numeric 1 supplies only the
  // currency/sign layout; the actual money digits never become a Number.
  return formatter
    .format(isNegative ? -1 : 1)
    .replace(/1(?:\.\d+)?/, exactNumber);
}

export function parseMajorAmountToMinor(
  amount: string,
  currency: string,
): string | null {
  const fractionDigits = currencyFractionDigits(currency);
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(amount.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > fractionDigits) return null;
  const wholeMinor = BigInt(match[1] ?? "0") * 10n ** BigInt(fractionDigits);
  const fractionalMinor = BigInt(fraction.padEnd(fractionDigits, "0") || "0");
  const total = wholeMinor + fractionalMinor;
  return total > 0n ? total.toString() : null;
}

export function minorToMajorInput(
  amountMinor: string,
  currency: string,
): string {
  const digits = currencyFractionDigits(currency);
  const amount = BigInt(amountMinor);
  const scale = 10n ** BigInt(digits);
  const whole = amount / scale;
  if (digits === 0) return whole.toString();
  const fraction = (amount % scale).toString().padStart(digits, "0");
  return `${whole}.${fraction}`;
}

function currencyFractionDigits(currency: string): number {
  return (
    new Intl.NumberFormat("en", {
      style: "currency",
      currency,
    }).resolvedOptions().maximumFractionDigits ?? 2
  );
}
