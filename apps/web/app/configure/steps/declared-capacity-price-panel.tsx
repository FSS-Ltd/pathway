import Link from "next/link";
import type { DeclaredCapacityInterval } from "@pathway/pricing";
import type { DeclaredCapacityEstimate } from "../../../lib/institutional-estimate-client";

function money(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

const LINE_LABELS: Record<"BASE" | "DECLARED_CAPACITY" | "ADDON", string> = {
  BASE: "Base subscription",
  DECLARED_CAPACITY: "Declared child capacity",
  ADDON: "Paid add-on",
};

export function DeclaredCapacityPricePanel({
  capacity,
  interval,
  estimate,
  loading,
  error,
  onRetry,
}: {
  capacity: number | null;
  interval: DeclaredCapacityInterval;
  estimate: DeclaredCapacityEstimate | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="declared-capacity-total-title"
      className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6"
    >
      <h2
        id="declared-capacity-total-title"
        className="font-heading text-xl font-bold"
      >
        Your configuration
      </h2>
      <div aria-live="polite" aria-atomic="true" className="mt-5 min-h-24">
        {error ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
            <button
              type="button"
              onClick={onRetry}
              className="text-sm font-semibold text-accent-strong underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            >
              Retry pricing
            </button>
          </div>
        ) : loading ? (
          <p role="status" className="text-sm text-text-muted">
            Updating your price…
          </p>
        ) : estimate?.kind === "contact_sales" ? (
          <div className="space-y-2 text-sm">
            <p className="font-semibold">Enterprise needs a custom quote.</p>
            <Link
              href={estimate.contactPath}
              className="font-semibold text-accent-strong underline"
            >
              Contact Nexsteps
            </Link>
          </div>
        ) : estimate?.kind === "priced" ? (
          <div className="space-y-3">
            <p className="text-sm font-semibold capitalize">
              {estimate.tier} · {estimate.declaredCapacity} children ·{" "}
              {interval === "year" ? "yearly" : "monthly"}
            </p>
            <p className="text-xs text-text-muted">
              {estimate.siteAllowance} included{" "}
              {estimate.siteAllowance === 1 ? "site" : "sites"} ·{" "}
              {estimate.trialModuleSlots} free add-on{" "}
              {estimate.trialModuleSlots === 1 ? "trial" : "trials"}
            </p>
            <dl className="space-y-2 text-sm">
              {estimate.lines.map((line) => (
                <div
                  key={line.priceCode}
                  className="flex justify-between gap-4"
                >
                  <dt className="text-text-muted">
                    {LINE_LABELS[line.component]}
                    {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                  </dt>
                  <dd className="font-medium text-text-primary">
                    {money(line.subtotalPence)}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="flex justify-between gap-4 border-t border-border-subtle pt-3 font-heading text-lg font-bold">
              <span>
                {interval === "year" ? "Payable annually" : "Monthly total"}
              </span>
              <span>{money(estimate.subtotalPence)}</span>
            </div>
            <p className="text-xs text-text-muted">
              {interval === "year"
                ? "Paid upfront once a year."
                : "Billed each month."}{" "}
              Free trials are not charged at checkout and never convert
              automatically.
            </p>
            <p className="text-xs text-text-muted">
              {estimate.pricesIncludeVat
                ? "VAT is included in this price. The total shown is the amount due at checkout."
                : "VAT is not currently charged. If VAT registration becomes required, VAT will be included within this price."}
            </p>
            {estimate.trialModules.length > 0 ? (
              <p className="text-xs text-text-muted">
                Selected for later activation:{" "}
                {estimate.trialModules.join(", ")}.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            {capacity === null
              ? "Enter your declared capacity to see the server-calculated price."
              : "Select your organisation and capacity to see a price."}
          </p>
        )}
      </div>
    </section>
  );
}
