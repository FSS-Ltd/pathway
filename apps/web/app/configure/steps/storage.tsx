import { PriceChip } from "../../../components/configurator/price-chip";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import {
  optionDelta,
  type OptionPriceLookup,
  type StorageChoice,
} from "../../../lib/module-catalog";

type StorageStepProps = {
  storageChoice: StorageChoice;
  frequency: "monthly" | "yearly";
  prices: OptionPriceLookup;
  onSelect: (storageChoice: StorageChoice) => void;
};

const STORAGE_OPTIONS: {
  value: StorageChoice;
  label: string;
  description: string;
}[] = [
  {
    value: "none",
    label: "No extra storage",
    description: "Use the storage included with your plan.",
  },
  {
    value: "100",
    label: "100GB",
    description: "Extra space for documents and media.",
  },
  {
    value: "200",
    label: "200GB",
    description: "More capacity for busy teams.",
  },
  {
    value: "1000",
    label: "1TB",
    description: "Substantial storage for larger organisations.",
  },
];

export function StorageStep({
  storageChoice,
  frequency,
  prices,
  onSelect,
}: StorageStepProps) {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Choose extra storage
        </h2>
        <p className="text-text-muted">
          Add storage if your team expects to keep a larger library of files.
        </p>
      </div>
      <SelectionCardGroup className="grid gap-3">
        {STORAGE_OPTIONS.map((option) => {
          const delta = optionDelta(
            { kind: "storage", storageChoice: option.value },
            frequency,
            prices,
          );
          return (
            <SelectionCard
              key={option.value}
              isSelected={storageChoice === option.value}
              isDisabled={delta.status === "coming-soon"}
              onClick={() => onSelect(option.value)}
            >
              <span className="flex items-start justify-between gap-3">
                <span>
                  <span className="block font-semibold text-text-primary">
                    {option.label}
                  </span>
                  <span className="mt-1 block text-sm text-text-muted">
                    {option.description}
                  </span>
                </span>
                <PriceChip delta={delta} frequency={frequency} />
              </span>
            </SelectionCard>
          );
        })}
      </SelectionCardGroup>
    </section>
  );
}
