import { PLANS } from "@pathway/pricing";
import { PriceChip } from "../../../components/configurator/price-chip";
import {
  SelectionCard,
  SelectionCardGroup,
} from "../../../components/configurator/selection-card";
import type { PlanCode, StripePriceMeta } from "../../../lib/buy-now-pricing";

type PlanStepProps = {
  planCode: PlanCode | null;
  frequency: "monthly" | "yearly";
  planPrices: Partial<Record<PlanCode, StripePriceMeta>>;
  onSelectPlan: (planCode: PlanCode) => void;
  onSelectFrequency: (frequency: "monthly" | "yearly") => void;
  onSelectEnterprise: () => void;
};

const PLAN_CODES: Record<
  "starter" | "growth" | "professional",
  Record<"monthly" | "yearly", PlanCode>
> = {
  starter: { monthly: "STARTER_49_MONTHLY", yearly: "STARTER_49_YEARLY" },
  growth: { monthly: "GROWTH_99_MONTHLY", yearly: "GROWTH_99_YEARLY" },
  professional: {
    monthly: "PROFESSIONAL_149_MONTHLY",
    yearly: "PROFESSIONAL_149_YEARLY",
  },
};

export function PlanStep({
  planCode,
  frequency,
  planPrices,
  onSelectPlan,
  onSelectFrequency,
  onSelectEnterprise,
}: PlanStepProps) {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Choose your plan
        </h2>
        <p className="text-text-muted">
          Choose the capacity that suits your organisation today.
        </p>
      </div>
      <div
        role="group"
        className="inline-flex rounded-lg border border-border-subtle bg-surface p-1"
        aria-label="Billing frequency"
      >
        {(["monthly", "yearly"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={frequency === value}
            onClick={() => onSelectFrequency(value)}
            className={`rounded-md px-4 py-2 text-sm font-semibold ${frequency === value ? "bg-accent-primary text-accent-foreground" : "text-text-muted hover:text-text-primary"}`}
          >
            {value === "monthly" ? "Monthly" : "Yearly"}
          </button>
        ))}
      </div>
      <SelectionCardGroup className="grid gap-3">
        {(Object.keys(PLAN_CODES) as (keyof typeof PLAN_CODES)[]).map(
          (tier) => {
            const code = PLAN_CODES[tier][frequency];
            const plan = PLANS[code];
            const amountMajor = planPrices[code]?.amountMajor;
            return (
              <SelectionCard
                key={code}
                isSelected={planCode === code}
                onClick={() => onSelectPlan(code)}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-semibold text-text-primary">
                      {plan.displayName}
                    </span>
                    <span className="mt-1 block text-sm text-text-muted">
                      Up to {plan.av30Included?.toLocaleString("en-GB")} Active
                      People · {plan.maxSitesIncluded}{" "}
                      {plan.maxSitesIncluded === 1 ? "site" : "sites"}
                    </span>
                  </span>
                  {amountMajor !== undefined ? (
                    <PriceChip
                      delta={{ status: "priced", amountMajor }}
                      frequency={frequency}
                      showPlus={false}
                    />
                  ) : null}
                </span>
              </SelectionCard>
            );
          },
        )}
        <SelectionCard isSelected={false} onClick={onSelectEnterprise}>
          <span className="block font-semibold">
            {PLANS.ENTERPRISE_CONTACT.displayName}
          </span>
          <span className="mt-1 block text-sm text-text-muted">
            Contact sales for a tailored plan for your organisation.
          </span>
        </SelectionCard>
      </SelectionCardGroup>
    </section>
  );
}
