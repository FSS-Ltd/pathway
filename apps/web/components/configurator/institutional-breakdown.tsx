import type { InstitutionalMappedQuote } from "@pathway/pricing";

export function formatInstitutionalMoney(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

const LINE_LABELS = {
  BASE: "Plan",
  CHILDREN_UP_TO_100: "Additional pupils up to 100",
  CHILDREN_101_TO_250: "Pupils 101–250",
  STORAGE: "Extra storage",
} as const;

export function InstitutionalBreakdown({
  quote,
  loading,
  error,
  onRetry,
}: {
  quote: InstitutionalMappedQuote | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  return (
    <section
      aria-labelledby="institutional-total-title"
      className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6"
    >
      <h2
        id="institutional-total-title"
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
        ) : quote?.kind === "contact_sales" ? (
          <p className="text-sm text-text-muted">
            More than 250 enrolled pupils needs a tailored quote. Contact our
            team to continue.
          </p>
        ) : quote?.kind === "priced" ? (
          <div className="space-y-3">
            <dl className="space-y-2 text-sm">
              {quote.lines
                .filter((line) => line.quantity > 0)
                .map((line) => (
                  <div
                    key={line.priceCode}
                    className="flex justify-between gap-4"
                  >
                    <dt className="text-text-muted">
                      {LINE_LABELS[line.component]}
                      {line.quantity > 1 ? ` × ${line.quantity}` : ""}
                    </dt>
                    <dd className="font-medium text-text-primary">
                      {formatInstitutionalMoney(line.subtotalPence)}
                    </dd>
                  </div>
                ))}
            </dl>
            <div className="flex justify-between gap-4 border-t border-border-subtle pt-3 font-heading text-lg font-bold">
              <span>
                {quote.interval === "year"
                  ? "Payable annually"
                  : "Monthly total"}
              </span>
              <span>{formatInstitutionalMoney(quote.subtotalPence)}</span>
            </div>
            <p className="text-xs text-text-muted">
              {quote.interval === "year"
                ? "One payment each year."
                : "Billed each month."}{" "}
              Final charges are confirmed by Stripe before payment.
            </p>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            Choose a plan and enter your pupil count to see a price.
          </p>
        )}
      </div>
    </section>
  );
}
