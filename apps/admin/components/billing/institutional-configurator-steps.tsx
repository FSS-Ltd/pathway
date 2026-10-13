import type {
  InstitutionalMappedPlanCode,
  InstitutionalStorageChoice,
} from "@pathway/pricing";
import type {
  InstitutionalCatalogue,
  InstitutionalSummary,
} from "../../lib/institutional-billing-client";
import { billingPeriod, money, planName } from "./institutional-summary";

export type BillingStep = "plan" | "pupils" | "modules" | "storage" | "review";
export const BILLING_STEPS: readonly BillingStep[] = [
  "plan",
  "pupils",
  "modules",
  "storage",
  "review",
];
export const BILLING_STEP_LABELS: Record<BillingStep, string> = {
  plan: "Plan and period",
  pupils: "Confirmed pupils",
  modules: "Modules",
  storage: "Storage",
  review: "Review",
};

export function BillingPlanStep({
  catalogue,
  selected,
  onSelect,
}: {
  catalogue: InstitutionalCatalogue;
  selected: InstitutionalMappedPlanCode;
  onSelect: (value: InstitutionalMappedPlanCode) => void;
}) {
  const period = billingPeriod(selected);
  return (
    <section className="space-y-4" aria-labelledby="billing-step-title">
      <h2 id="billing-step-title" className="font-heading text-xl font-bold">
        Plan and billing period
      </h2>
      <div role="group" aria-label="Billing period" className="flex gap-2">
        {(["month", "year"] as const).map((interval) => (
          <button
            key={interval}
            type="button"
            aria-pressed={period === interval}
            className={`rounded-lg border px-4 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-accent-primary ${period === interval ? "border-accent-primary bg-accent-primary/10" : "border-border-subtle"}`}
            onClick={() => {
              const tier = catalogue.plans.find(
                (plan) => plan.planCode === selected,
              )?.tier;
              const next = catalogue.plans.find(
                (plan) => plan.tier === tier && plan.interval === interval,
              );
              if (next) onSelect(next.planCode);
            }}
          >
            {interval === "year" ? "Annual" : "Monthly"}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {catalogue.plans
          .filter((plan) => plan.interval === period)
          .map((plan) => (
            <button
              key={plan.planCode}
              type="button"
              disabled={!plan.available}
              aria-pressed={selected === plan.planCode}
              onClick={() => onSelect(plan.planCode)}
              className={`rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-accent-primary disabled:opacity-50 ${selected === plan.planCode ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle"}`}
            >
              <span className="flex justify-between gap-3">
                <span className="font-semibold capitalize">{plan.tier}</span>
                <span className="font-semibold">
                  {plan.basePrice
                    ? `${money(plan.basePrice.subtotalPence)} / ${period}`
                    : "Unavailable"}
                </span>
              </span>
              <span className="mt-1 block text-sm text-text-muted">
                {plan.includedChildren} pupils and {plan.includedSites}{" "}
                {plan.includedSites === 1 ? "site" : "sites"} included
              </span>
            </button>
          ))}
      </div>
    </section>
  );
}

export function BillingPupilsStep({
  summary,
  declaredCount,
  onDeclaredCount,
}: {
  summary: InstitutionalSummary;
  declaredCount: string;
  onDeclaredCount: (value: string) => void;
}) {
  const confirmed =
    summary.countSource === "VERIFIED" && summary.liveForecast
      ? summary.liveForecast.enrolledChildren
      : null;
  return (
    <section className="space-y-4" aria-labelledby="billing-step-title">
      <h2 id="billing-step-title" className="font-heading text-xl font-bold">
        Confirmed pupil count
      </h2>
      {summary.currentPaid ? (
        <div className="rounded-xl border border-border-subtle p-4">
          <p className="text-lg font-semibold">
            {confirmed === null
              ? "Awaiting confirmed roll"
              : `${confirmed} enrolled pupils`}
          </p>
          <p className="mt-1 text-sm text-text-muted">
            Renewal uses the confirmed roll and the seven-day census cutoff.
            This count cannot be changed here.
          </p>
        </div>
      ) : (
        <label className="block max-w-sm text-sm font-semibold">
          Enrolled pupils
          <input
            type="number"
            min="0"
            step="1"
            required
            value={declaredCount}
            onChange={(event) => onDeclaredCount(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border-subtle bg-surface p-3 focus-visible:ring-2 focus-visible:ring-accent-primary"
          />
          <span className="mt-2 block font-normal text-text-muted">
            This declaration is used for your first purchase. Confirm the count
            before reviewing a quote.
          </span>
        </label>
      )}
    </section>
  );
}

export function BillingModulesStep({
  summary,
}: {
  summary: InstitutionalSummary;
}) {
  const granted = [
    ...(summary.currentPaid?.includedModules ?? []),
    ...(summary.currentPaid?.paidModules ?? []),
  ].filter((module) => module !== "LEARNING");
  return (
    <section className="space-y-4" aria-labelledby="billing-step-title">
      <h2 id="billing-step-title" className="font-heading text-xl font-bold">
        Modules
      </h2>
      <div className="rounded-xl border border-accent-primary bg-accent-primary/5 p-4 font-semibold">
        Learning · included
      </div>
      <p className="text-sm text-text-muted">
        Optional modules are unavailable for new selection. Existing grants
        remain active through your paid period.
      </p>
      {granted.length > 0 && (
        <div className="rounded-xl border border-border-subtle p-4">
          <p className="font-semibold">Your existing grants</p>
          <p className="mt-1 text-sm text-text-muted">{granted.join(", ")}</p>
        </div>
      )}
    </section>
  );
}

const STORAGE: { choice: InstitutionalStorageChoice; label: string }[] = [
  { choice: "none", label: "Included storage" },
  { choice: "100", label: "100GB extra" },
  { choice: "200", label: "200GB extra" },
  { choice: "1000", label: "1TB extra" },
];

export function BillingStorageStep({
  choice,
  onSelect,
}: {
  choice: InstitutionalStorageChoice;
  onSelect: (value: InstitutionalStorageChoice) => void;
}) {
  return (
    <section className="space-y-4" aria-labelledby="billing-step-title">
      <h2 id="billing-step-title" className="font-heading text-xl font-bold">
        Storage
      </h2>
      <p className="text-sm text-text-muted">
        Your selected Stripe price appears in the proposed total.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {STORAGE.map((option) => (
          <button
            key={option.choice}
            type="button"
            aria-pressed={choice === option.choice}
            onClick={() => onSelect(option.choice)}
            className={`rounded-xl border p-4 text-left font-semibold focus-visible:ring-2 focus-visible:ring-accent-primary ${choice === option.choice ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle"}`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}

export function BillingCurrentCharge({
  summary,
}: {
  summary: InstitutionalSummary;
}) {
  if (!summary.currentPaid)
    return (
      <p className="text-sm text-text-muted">
        No current institutional subscription.
      </p>
    );
  return (
    <p className="text-sm">
      Current:{" "}
      <strong className="capitalize">
        {planName(summary.currentPaid.planCode)}
      </strong>{" "}
      · {money(summary.currentPaid.subtotalPence)} per{" "}
      {billingPeriod(summary.currentPaid.planCode)} through{" "}
      {new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
        new Date(summary.currentPaid.periodEnd),
      )}
    </p>
  );
}
