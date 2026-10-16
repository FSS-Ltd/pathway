import type { DeclaredCapacityInterval } from "@pathway/pricing";
import type {
  DeclaredCapacityAddonOption,
  DeclaredCapacityCatalogue,
} from "../../../lib/institutional-estimate-client";
import type {
  DeclaredCapacityAddonChoice,
  DeclaredCapacityAddonSelection,
} from "../declared-capacity-flow";
import { MODULE_CATALOG } from "../../../lib/module-catalog";

function money(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

function modulePrice(
  option: DeclaredCapacityAddonOption,
  interval: DeclaredCapacityInterval,
): number | null {
  return interval === "year"
    ? option.yearlyPricePence
    : option.monthlyPricePence;
}

export function DeclaredCapacityModulesStep({
  catalogue,
  interval,
  selection,
  trialSlots,
  onChoice,
}: {
  catalogue: DeclaredCapacityCatalogue;
  interval: DeclaredCapacityInterval;
  selection: DeclaredCapacityAddonSelection;
  trialSlots: number;
  onChoice: (
    option: DeclaredCapacityAddonOption,
    choice: DeclaredCapacityAddonChoice,
  ) => void;
}) {
  const trialSlotsRemaining = Math.max(
    0,
    trialSlots - selection.trialModules.length,
  );

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          Choose optional add-ons
        </h2>
        <p className="mt-2 text-text-muted">
          Select a paid add-on for checkout, or reserve a free 60-day trial for
          activation after setup. Selecting a trial does not start its clock or
          charge you.
        </p>
        <p className="mt-2 text-sm font-semibold">
          {trialSlotsRemaining} of {trialSlots} free trial selections remaining
        </p>
      </div>
      <ul className="grid gap-3 sm:grid-cols-2">
        {catalogue.addonOptions.map((option) => {
          const item = MODULE_CATALOG[option.module];
          const isTrialSelected = selection.trialModules.includes(
            option.module,
          );
          const isPaidSelected = selection.payNowModules.includes(
            option.module,
          );
          const price = modulePrice(option, interval);

          return (
            <li
              key={option.module}
              className="rounded-xl border border-border-subtle bg-surface p-4"
            >
              <h3 className="font-semibold">{item.label}</h3>
              <p className="mt-1 min-h-10 text-sm text-text-muted">
                {item.description}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {option.trialAvailable ? (
                  <button
                    type="button"
                    aria-pressed={isTrialSelected}
                    disabled={!isTrialSelected && trialSlotsRemaining === 0}
                    onClick={() =>
                      onChoice(option, isTrialSelected ? "none" : "trial")
                    }
                    className="rounded-lg border border-accent-strong px-3 py-2 text-sm font-semibold text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isTrialSelected
                      ? "Remove trial selection"
                      : "Select 60-day trial"}
                  </button>
                ) : null}
                {price !== null ? (
                  <button
                    type="button"
                    aria-pressed={isPaidSelected}
                    onClick={() =>
                      onChoice(option, isPaidSelected ? "none" : "pay-now")
                    }
                    className={`rounded-lg border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${isPaidSelected ? "border-accent-strong bg-accent-subtle text-accent-strong" : "border-border-subtle text-text-primary"}`}
                  >
                    {isPaidSelected
                      ? "Remove paid add-on"
                      : `Add for ${money(price)} / ${interval === "year" ? "year" : "month"}`}
                  </button>
                ) : null}
              </div>
              {!option.trialAvailable && price === null ? (
                <p className="mt-3 text-xs text-text-muted">
                  Not available for this launch. No unapproved price is shown.
                </p>
              ) : null}
              {isTrialSelected ? (
                <p className="mt-3 text-xs text-text-muted">
                  Reserved for setup. A billing admin must activate it in the
                  app; its 60-day period starts only then.
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
