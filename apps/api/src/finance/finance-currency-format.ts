import type { FinanceCurrency } from "@pathway/platform";

export function formatFinanceMoney(
  amountMinor: string,
  currency: FinanceCurrency,
): string {
  const amount = BigInt(amountMinor);
  const isNegative = amount < 0n;
  const absolute = isNegative ? -amount : amount;
  const formatter = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  });
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  const unit = 10n ** BigInt(fractionDigits);
  const whole = new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: 0,
  }).format(absolute / unit);
  const fraction = (absolute % unit).toString().padStart(fractionDigits, "0");
  const parts = formatter.formatToParts(isNegative ? -1 : 1);
  let hasWhole = false;

  return parts
    .map((part) => {
      if (part.type === "integer") {
        if (hasWhole) return "";
        hasWhole = true;
        return whole;
      }
      if (part.type === "group") return "";
      if (part.type === "fraction") return fraction;
      return part.value;
    })
    .join("");
}
