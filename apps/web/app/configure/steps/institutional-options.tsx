import type { InstitutionalStorageChoice } from "@pathway/pricing";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import { MODULE_CATALOG } from "../../../lib/module-catalog";

const STORAGE: {
  choice: InstitutionalStorageChoice;
  label: string;
  description: string;
}[] = [
  {
    choice: "none",
    label: "Included storage",
    description: "Use the storage included with your plan.",
  },
  {
    choice: "100",
    label: "100GB extra",
    description: "More room for documents and media.",
  },
  {
    choice: "200",
    label: "200GB extra",
    description: "Space for a growing library.",
  },
  {
    choice: "1000",
    label: "1TB extra",
    description: "Capacity for larger organisations.",
  },
];

export function InstitutionalModulesStep() {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          Modules
        </h2>
        <p className="mt-2 text-text-muted">
          Learning is included with every plan. Optional modules are not yet
          available for new purchases.
        </p>
      </div>
      <div className="rounded-xl border border-accent-primary bg-accent-primary/5 p-4 text-sm font-semibold">
        Learning · included
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {Object.entries(MODULE_CATALOG)
          .filter(([code]) => code !== "LEARNING")
          .map(([code, module]) => (
            <li
              key={code}
              className="rounded-xl border border-border-subtle bg-surface p-4 opacity-75"
            >
              <span className="block font-semibold">{module.label}</span>
              <span className="mt-1 block text-sm text-text-muted">
                {module.description}
              </span>
              <span className="mt-2 block text-xs font-semibold text-text-muted">
                Coming soon
              </span>
            </li>
          ))}
      </ul>
    </section>
  );
}

export function InstitutionalStorageStep({
  choice,
  onSelect,
  priceOptions,
  interval,
}: {
  choice: InstitutionalStorageChoice;
  onSelect: (choice: InstitutionalStorageChoice) => void;
  priceOptions?: readonly {
    choice: InstitutionalStorageChoice;
    monthlyPricePence: number | null;
    yearlyPricePence: number | null;
  }[];
  interval?: "month" | "year";
}) {
  const money = (pence: number) =>
    new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(pence / 100);

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          Storage
        </h2>
        <p className="mt-2 text-text-muted">
          Choose any extra space your team needs. Storage is billed with your
          selected subscription period.
        </p>
      </div>
      <SelectionCardGroup className="grid gap-3">
        {STORAGE.map((option) => {
          const label =
            priceOptions && option.choice === "none"
              ? "No additional storage"
              : option.label;
          const description =
            priceOptions && option.choice === "none"
              ? "Continue without an extra storage package."
              : option.description;
          const mappedPrice = priceOptions?.find(
            (price) => price.choice === option.choice,
          );
          const amount =
            interval === "year"
              ? mappedPrice?.yearlyPricePence
              : mappedPrice?.monthlyPricePence;
          const unavailable =
            option.choice !== "none" &&
            priceOptions !== undefined &&
            amount == null;

          return (
            <SelectionCard
              key={option.choice}
              isSelected={choice === option.choice}
              isDisabled={unavailable}
              onClick={() => onSelect(option.choice)}
            >
              <span className="block font-semibold">{label}</span>
              <span className="mt-1 block text-sm text-text-muted">
                {description}
              </span>
              {priceOptions ? (
                <span className="mt-2 block text-sm font-semibold">
                  {option.choice === "none"
                    ? "No extra charge"
                    : amount == null
                      ? "Unavailable for this billing period"
                      : `${money(amount)} per ${interval === "year" ? "year" : "month"}`}
                </span>
              ) : null}
            </SelectionCard>
          );
        })}
      </SelectionCardGroup>
    </section>
  );
}
