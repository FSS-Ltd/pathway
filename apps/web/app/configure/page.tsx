"use client";

import React from "react";
import Link from "next/link";
import {
  INSTITUTIONAL_PLANS,
  type InstitutionalPlanCode,
  type InstitutionalQuoteResult,
} from "@pathway/pricing";
import { estimateInstitutionalPrice } from "../../lib/institutional-estimate-client";

const plans = Object.values(INSTITUTIONAL_PLANS);
const money = (pence: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP" }).format(
    pence / 100,
  );

export default function ConfigurePage() {
  const [planCode, setPlanCode] = React.useState<InstitutionalPlanCode>(
    "INSTITUTIONAL_STARTER_MONTHLY",
  );
  const [countInput, setCountInput] = React.useState("25");
  const [estimate, setEstimate] =
    React.useState<InstitutionalQuoteResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const count = Number(countInput);
  const validCount =
    countInput.trim() !== "" && Number.isSafeInteger(count) && count >= 0;

  React.useEffect(() => {
    if (!validCount) {
      setEstimate(null);
      setError("Enter a whole number of enrolled children, including zero.");
      return;
    }
    const controller = new AbortController();
    setPending(true);
    setError(null);
    void estimateInstitutionalPrice(planCode, count, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setEstimate(result);
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEstimate(null);
          setError("The estimate is unavailable. Please try again.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setPending(false);
      });
    return () => controller.abort();
  }, [planCode, count, validCount]);

  const chosen = INSTITUTIONAL_PLANS[planCode];
  const band = (component: "CHILDREN_UP_TO_100" | "CHILDREN_101_TO_250") =>
    estimate?.kind === "priced"
      ? (estimate.lines.find((line) => line.component === component)
          ?.subtotalPence ?? 0)
      : 0;

  return (
    <div className="bg-shell px-4 py-8 text-text-primary sm:px-6 sm:py-12">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="max-w-3xl space-y-3">
          <p className="text-sm font-semibold uppercase tracking-wide text-accent-strong">
            Nexsteps for organisations
          </p>
          <h1 className="font-heading text-3xl font-bold sm:text-4xl">
            Pricing for every child you serve.
          </h1>
          <p className="text-base leading-relaxed text-text-muted">
            One monthly plan for churches, charities, clubs, schools and
            nurseries. Count each enrolled child once across your organisation’s
            permitted sites. Parents, staff, volunteers and adult participants
            are not counted.
          </p>
        </header>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr),minmax(300px,0.7fr)]">
          <section
            aria-labelledby="plan-title"
            className="space-y-6 rounded-2xl border border-border-subtle bg-surface p-5 shadow-soft sm:p-7"
          >
            <div>
              <h2 id="plan-title" className="font-heading text-xl font-bold">
                Choose your plan
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                Your child count stays the same when you compare plans.
              </p>
            </div>
            <fieldset className="grid gap-3 sm:grid-cols-3">
              <legend className="sr-only">Monthly plan</legend>
              {plans.map((plan) => (
                <label
                  key={plan.code}
                  className={`cursor-pointer rounded-xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-accent-primary ${planCode === plan.code ? "border-accent-primary bg-accent-primary/5" : "border-border-subtle hover:border-accent-primary"}`}
                >
                  <input
                    type="radio"
                    name="institutional-plan"
                    value={plan.code}
                    checked={planCode === plan.code}
                    onChange={() => setPlanCode(plan.code)}
                    className="sr-only"
                  />
                  <span className="block text-base font-semibold capitalize">
                    {plan.tier}
                  </span>
                  <span className="mt-1 block text-xl font-bold">
                    {money(plan.basePence)}
                    <span className="text-sm font-normal text-text-muted">
                      {" "}
                      / month
                    </span>
                  </span>
                  <span className="mt-2 block text-xs text-text-muted">
                    Includes {plan.includedChildren} children ·{" "}
                    {plan.includedSites}{" "}
                    {plan.includedSites === 1 ? "site" : "sites"} ·{" "}
                    {plan.includedModuleSlots} optional module{" "}
                    {plan.includedModuleSlots === 1 ? "place" : "places"}
                  </span>
                </label>
              ))}
            </fieldset>
            <div>
              <label
                htmlFor="enrolled-children"
                className="block text-sm font-semibold"
              >
                Enrolled children
              </label>
              <p id="enrolled-help" className="mt-1 text-sm text-text-muted">
                Count distinct children on your continuing roll, whether or not
                they attended today.
              </p>
              <input
                id="enrolled-children"
                aria-describedby="enrolled-help"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={countInput}
                onChange={(event) => setCountInput(event.target.value)}
                className="mt-3 w-full max-w-48 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
              />
            </div>
            <div className="rounded-xl border border-border-subtle bg-muted/40 p-4">
              <h3 className="text-sm font-semibold">Optional modules</h3>
              <p className="mt-1 text-sm text-text-muted">
                No optional modules are ready to offer yet. Your plan’s module
                places will become available when modules are released. Learning
                is part of the core platform.
              </p>
            </div>
          </section>
          <aside
            aria-labelledby="estimate-title"
            className="h-fit rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-7 lg:sticky lg:top-24"
          >
            <h2 id="estimate-title" className="font-heading text-xl font-bold">
              Monthly estimate
            </h2>
            <p className="mt-1 text-sm text-text-muted capitalize">
              {chosen.tier} · enrolled children
            </p>
            <div
              aria-live="polite"
              aria-atomic="true"
              className="mt-6 min-h-28"
            >
              {error ? (
                <p role="alert" className="text-sm text-status-danger">
                  {error}
                </p>
              ) : pending ? (
                <p className="text-sm text-text-muted">Updating estimate…</p>
              ) : estimate?.kind === "contact_sales" ? (
                <div className="space-y-3">
                  <p className="text-lg font-semibold">Custom quote required</p>
                  <p className="text-sm text-text-muted">
                    For more than 250 children, we’ll agree a price with your
                    organisation.
                  </p>
                </div>
              ) : estimate ? (
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between gap-4">
                    <span>Base · includes {estimate.includedChildren}</span>
                    <span>
                      {money(
                        estimate.lines.find((line) => line.component === "BASE")
                          ?.subtotalPence ?? 0,
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Additional children to 100 · £1 each</span>
                    <span>{money(band("CHILDREN_UP_TO_100"))}</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span>Children 101–250 · 75p each</span>
                    <span>{money(band("CHILDREN_101_TO_250"))}</span>
                  </div>
                  <div className="border-t border-border-subtle pt-3">
                    <div className="flex justify-between gap-4 text-lg font-bold">
                      <span>Estimated monthly total</span>
                      <span>{money(estimate.subtotalPence)}</span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-text-muted">
              The base fee applies even with zero children. This estimate is not
              a quote or a charge. Final billing uses an accepted count and the
              census before renewal.
            </p>
            <Link
              href="/demo"
              className="mt-6 inline-flex w-full justify-center rounded-lg bg-accent-primary px-4 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2"
            >
              Talk to our team
            </Link>
            <p className="mt-3 text-center text-xs text-text-muted">
              New-plan checkout is currently unavailable.
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
}
