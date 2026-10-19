import type { FinanceCurrency } from "@pathway/platform";

const integerFormatter = new Intl.NumberFormat("en-GB", {
  maximumFractionDigits: 0,
});

export function formatFinanceMoney(
  amountMinor: string,
  currency: FinanceCurrency,
): string {
  const amount = BigInt(amountMinor);
  const isNegative = amount < 0n;
  const absolute = isNegative ? -amount : amount;
  const whole = integerFormatter.format(absolute / 100n);
  const fraction = (absolute % 100n).toString().padStart(2, "0");
  const parts = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).formatToParts(isNegative ? -1 : 1);
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
