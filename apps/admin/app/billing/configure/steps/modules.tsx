import { PriceChip } from "../../../../components/configurator/price-chip";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../../components/configurator/selection-card";
import {
  MODULE_CATALOG,
  optionDelta,
  type OptionPriceLookup,
  type WebModule,
} from "../../../../lib/module-catalog";

type ModulesStepProps = {
  includedModules: WebModule[];
  ownedModules: WebModule[];
  selectedOptionalModules: WebModule[];
  eligibleOptionalModules: WebModule[];
  frequency: "monthly" | "yearly";
  prices: OptionPriceLookup;
  planLabel: string;
  onToggle: (module: WebModule) => void;
};

export function ModulesStep({
  includedModules,
  ownedModules,
  selectedOptionalModules,
  eligibleOptionalModules,
  frequency,
  prices,
  planLabel,
  onToggle,
}: ModulesStepProps) {
  const includedSet = new Set(includedModules);
  const ownedSet = new Set(ownedModules);

  const included = includedModules.map((module) => ({
    module,
    entry: MODULE_CATALOG[module],
  }));

  // Optional modules the org already owns show as active, not chargeable again.
  const ownedOptional = eligibleOptionalModules
    .filter((module) => ownedSet.has(module) && !includedSet.has(module))
    .map((module) => ({ module, entry: MODULE_CATALOG[module] }));

  const optionalModules = (
    Object.entries(MODULE_CATALOG) as [
      WebModule,
      (typeof MODULE_CATALOG)[WebModule],
    ][]
  )
    .filter(
      ([module]) =>
        eligibleOptionalModules.includes(module) && !ownedSet.has(module),
    )
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
          Choose the extra capabilities your team needs now. You can change
          these later.
        </p>
      </div>
      <SelectionCardGroup className="grid gap-3">
        {included.map(({ module, entry }) => (
          <SelectionCard key={module} isSelected isDisabled onClick={() => undefined}>
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-semibold text-text-primary">
                  {entry.label}
                </span>
                <span className="mt-1 block text-sm text-text-muted">
                  Included in {planLabel}
                </span>
              </span>
              <span className="text-sm font-semibold text-text-muted">
                Included
              </span>
            </span>
          </SelectionCard>
        ))}
        {ownedOptional.map(({ module, entry }) => (
          <SelectionCard key={module} isSelected isDisabled onClick={() => undefined}>
            <span className="flex items-start justify-between gap-3">
              <span>
                <span className="block font-semibold text-text-primary">
                  {entry.label}
                </span>
                <span className="mt-1 block text-sm text-text-muted">
                  Already active on your organisation
                </span>
              </span>
              <span className="text-sm font-semibold text-text-muted">
                Active
              </span>
            </span>
          </SelectionCard>
        ))}
        {optionalModules.map(({ module, entry, delta }) => (
          <SelectionCard
            key={module}
            isSelected={selectedOptionalModules.includes(module)}
            isDisabled={delta.status === "coming-soon"}
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
              <PriceChip delta={delta} frequency={frequency} />
            </span>
          </SelectionCard>
        ))}
      </SelectionCardGroup>
    </section>
  );
}
