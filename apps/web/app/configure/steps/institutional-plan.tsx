import type { InstitutionalMappedPlanCode } from "@pathway/pricing";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import { formatInstitutionalMoney } from "../../../components/configurator/institutional-breakdown";
import type { InstitutionalCatalogue } from "../../../lib/institutional-estimate-client";

const TIERS = ["starter", "growth", "professional"] as const;

export function InstitutionalPlanStep({
  catalogue,
  selected,
  onSelect,
}: {
  catalogue: InstitutionalCatalogue;
  selected: InstitutionalMappedPlanCode;
  onSelect: (planCode: InstitutionalMappedPlanCode) => void;
}) {
  const interval = selected.endsWith("_YEARLY") ? "year" : "month";
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          Plan and billing period
        </h2>
        <p className="mt-2 text-text-muted">
          Choose the capacity that fits your setting. Your pupil count and
          storage can be changed before payment.
        </p>
      </div>
      <div
        role="group"
        aria-label="Billing period"
        className="inline-flex rounded-lg border border-border-subtle bg-surface p-1"
      >
        {(["month", "year"] as const).map((period) => (
          <button
            key={period}
            type="button"
            aria-pressed={interval === period}
            onClick={() => {
              const matching = catalogue.plans.find(
                (plan) =>
                  plan.tier ===
                    catalogue.plans.find((item) => item.planCode === selected)
                      ?.tier && plan.interval === period,
              );
              if (matching) onSelect(matching.planCode);
            }}
            className={`rounded-md px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${interval === period ? "bg-accent-primary text-accent-foreground" : "text-text-muted hover:text-text-primary"}`}
          >
            {period === "year" ? "Annual" : "Monthly"}
          </button>
        ))}
      </div>
      <SelectionCardGroup className="grid gap-3">
        {TIERS.map((tier) => {
          const plan = catalogue.plans.find(
            (item) => item.tier === tier && item.interval === interval,
          );
          if (!plan) return null;
          return (
            <SelectionCard
              key={plan.planCode}
              isSelected={selected === plan.planCode}
              isDisabled={!plan.available}
              onClick={() => onSelect(plan.planCode)}
            >
              <span className="flex items-start justify-between gap-4">
                <span>
                  <span className="block text-base font-semibold capitalize">
                    {tier}
                  </span>
                  <span className="mt-1 block text-sm text-text-muted">
                    Includes {plan.includedChildren} pupils ·{" "}
                    {plan.includedSites}{" "}
                    {plan.includedSites === 1 ? "site" : "sites"} ·{" "}
                    {plan.includedModuleSlots} future module{" "}
                    {plan.includedModuleSlots === 1 ? "place" : "places"}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm font-semibold">
                  {plan.available && plan.basePrice
                    ? `${formatInstitutionalMoney(plan.basePrice.subtotalPence)} / ${interval === "year" ? "year" : "month"}`
                    : "Unavailable"}
                </span>
              </span>
            </SelectionCard>
          );
        })}
      </SelectionCardGroup>
      <p className="text-xs text-text-muted">
        Annual prices are resolved independently from Stripe. Any selected plan
        with an unavailable price cannot continue to checkout.
      </p>
    </section>
  );
}
