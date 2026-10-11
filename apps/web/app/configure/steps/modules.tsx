import { PriceChip } from "../../../components/configurator/price-chip";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import {
  MODULE_CATALOG,
  optionDelta,
  type OptionPriceLookup,
  type WebModule,
} from "../../../lib/module-catalog";

type ModulesStepProps = {
  selectedOptionalModules: WebModule[];
  selectedIncludedModules: WebModule[];
  includedModuleLimit: number;
  eligibleOptionalModules: WebModule[];
  frequency: "monthly" | "yearly";
  prices: OptionPriceLookup;
  planLabel: string;
  onToggle: (module: WebModule) => void;
};

export function ModulesStep({
  selectedOptionalModules,
  selectedIncludedModules,
  includedModuleLimit,
  eligibleOptionalModules,
  frequency,
  prices,
  planLabel,
  onToggle,
}: ModulesStepProps) {
  const selectedIncludedSet = new Set(selectedIncludedModules);
  const selectedOptionalSet = new Set(selectedOptionalModules);
  const optionalModules = (
    Object.entries(MODULE_CATALOG) as [
      WebModule,
      (typeof MODULE_CATALOG)[WebModule],
    ][]
  )
    .filter(([module]) => eligibleOptionalModules.includes(module))
    .map(([module, entry]) => ({
      module,
      entry,
      delta: optionDelta({ kind: "module", module }, frequency, prices),
    }))
    .sort(
      (a, b) =>
        Number(a.delta.status === "coming-soon") -
        Number(b.delta.status === "coming-soon"),
    );

  const availableIncludedSlots = Math.max(
    0,
    includedModuleLimit - selectedIncludedModules.length,
  );

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Add optional modules
        </h2>
        <p className="text-text-muted">
          Choose up to {includedModuleLimit} modules included with {planLabel}.
          Other selected modules are charged at the prices shown.
        </p>
      </div>
      <SelectionCardGroup className="grid gap-3">
        {optionalModules.map(({ module, entry, delta }) => (
          <SelectionCard
            key={module}
            isSelected={
              selectedIncludedSet.has(module) || selectedOptionalSet.has(module)
            }
            isDisabled={
              delta.status === "coming-soon" &&
              availableIncludedSlots === 0 &&
              !selectedIncludedSet.has(module)
            }
            onClick={() => onToggle(module)}
          >
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-semibold text-text-primary">
                  {entry.label}
                </span>
                <span className="mt-1 block text-sm text-text-muted">
                  {entry.description}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                {selectedIncludedSet.has(module) ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-text-primary">
                    Included in {planLabel}
                  </span>
                ) : selectedOptionalSet.has(module) ? (
                  <PriceChip delta={delta} frequency={frequency} />
                ) : availableIncludedSlots > 0 ? (
                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-text-primary">
                    Included choice ({availableIncludedSlots} left)
                  </span>
                ) : (
                  <PriceChip delta={delta} frequency={frequency} />
                )}
              </span>
            </span>
          </SelectionCard>
        ))}
      </SelectionCardGroup>
    </section>
  );
}
