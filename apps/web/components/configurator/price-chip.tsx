import type { OptionDelta } from "../../lib/module-catalog";

type PriceChipProps = {
  delta: OptionDelta;
  frequency: "monthly" | "yearly";
  showPlus?: boolean;
};

const currencyFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatConfiguratorMoney(amountMajor: number): string {
  return currencyFormatter.format(amountMajor);
}

export function PriceChip({
  delta,
  frequency,
  showPlus = true,
}: PriceChipProps) {
  const label =
    delta.status === "included"
      ? "Included"
      : delta.status === "coming-soon"
        ? "Coming soon"
        : `${showPlus ? "+" : ""}${formatConfiguratorMoney(delta.amountMajor)}/${frequency === "monthly" ? "mo" : "yr"}`;

  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-text-primary">
      {label}
    </span>
  );
}
