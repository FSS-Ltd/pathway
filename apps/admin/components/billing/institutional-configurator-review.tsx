import { Button, Card } from "@pathway/ui";
import {
  mappedInstitutionalPlanDetails,
  type InstitutionalMappedQuote,
} from "@pathway/pricing";
import type {
  InstitutionalQuote,
  InstitutionalSummary,
} from "../../lib/institutional-billing-client";
import { BillingCurrentCharge } from "./institutional-configurator-steps";
import { date, money } from "./institutional-summary";

function ProposedCharge({
  quote,
  estimate,
}: {
  quote: InstitutionalQuote | null;
  estimate: InstitutionalMappedQuote | null;
}) {
  const proposed =
    quote?.status === "PRICED"
      ? quote
      : estimate?.kind === "priced"
        ? estimate
        : null;
  if (estimate?.kind === "contact_sales") {
    return (
      <p className="text-sm text-text-muted">
        More than 250 pupils needs a tailored quote. Contact support to
        continue.
      </p>
    );
  }
  if (!proposed)
    return (
      <p className="text-sm text-text-muted">
        Enter a valid pupil count to see the proposed charge.
      </p>
    );
  const interval = mappedInstitutionalPlanDetails(proposed.planCode).interval;
  return (
    <div className="space-y-2 text-sm" aria-live="polite">
      <p className="font-semibold">
        Proposed: {money(proposed.subtotalPence)} payable{" "}
        {interval === "year" ? "annually" : "monthly"}
      </p>
      <dl className="space-y-1">
        {proposed.lines.map((line, index) => (
          <div key={index} className="flex justify-between gap-4">
            <dt className="text-text-muted">
              {line.component === "BASE"
                ? "Plan"
                : line.component === "STORAGE"
                  ? "Extra storage"
                  : line.component === "CHILDREN_UP_TO_100"
                    ? "Additional pupils to 100"
                    : "Pupils 101–250"}{" "}
              × {line.quantity}
            </dt>
            <dd>{money(line.subtotalPence)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function BillingReviewStep({
  summary,
  quote,
  estimate,
  declarationAccepted,
  onDeclarationChange,
  pending,
  canReview,
  onPreview,
  onAccept,
}: {
  summary: InstitutionalSummary;
  quote: InstitutionalQuote | null;
  estimate: InstitutionalMappedQuote | null;
  declarationAccepted: boolean;
  onDeclarationChange: (value: boolean) => void;
  pending: boolean;
  canReview: boolean;
  onPreview: () => void;
  onAccept: () => void;
}) {
  const currentCutoffOpen =
    summary.nextCutoffAt && new Date() <= new Date(summary.nextCutoffAt);
  return (
    <section className="space-y-4" aria-labelledby="billing-step-title">
      <h2 id="billing-step-title" className="font-heading text-xl font-bold">
        Review your billing
      </h2>
      <BillingCurrentCharge summary={summary} />
      <ProposedCharge quote={quote} estimate={estimate} />
      {summary.currentPaid ? (
        <p className="text-sm text-text-muted">
          {currentCutoffOpen
            ? `If accepted before the census cutoff, this change takes effect at renewal on ${date(summary.currentPaid.periodEnd)}.`
            : "The census cutoff for the current period has passed. This change will take effect at a later eligible renewal."}{" "}
          Census cutoff: {date(summary.nextCutoffAt)}.
        </p>
      ) : (
        <label className="flex gap-2 text-sm">
          <input
            type="checkbox"
            checked={declarationAccepted}
            onChange={(event) => onDeclarationChange(event.target.checked)}
            className="accent-accent-primary"
          />
          I confirm the declared enrolled pupil count is accurate.
        </label>
      )}
      {quote && (
        <p className="text-xs text-text-muted">
          Quote expires {date(quote.expiresAt)}.{" "}
          {summary.currentPaid
            ? "No charge is made today."
            : "Payment is collected securely through Stripe."}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button size="sm" disabled={pending || !canReview} onClick={onPreview}>
          {pending ? "Checking…" : "Get final quote"}
        </Button>
        {quote?.status === "PRICED" && (
          <Button
            size="sm"
            disabled={pending || new Date(quote.expiresAt ?? 0) <= new Date()}
            onClick={onAccept}
          >
            {pending
              ? "Saving…"
              : summary.currentPaid
                ? "Accept renewal change"
                : "Continue to payment"}
          </Button>
        )}
      </div>
    </section>
  );
}

export function BillingRunningTotal({
  summary,
  quote,
  estimate,
  priceError,
  pricingPending,
  onRetry,
}: {
  summary: InstitutionalSummary;
  quote: InstitutionalQuote | null;
  estimate: InstitutionalMappedQuote | null;
  priceError: string | null;
  pricingPending: boolean;
  onRetry: () => void;
}) {
  return (
    <Card title="Running total">
      <BillingCurrentCharge summary={summary} />
      <div className="mt-4 border-t border-border-subtle pt-4">
        {priceError ? (
          <p role="alert" className="text-sm text-status-danger">
            {priceError}
          </p>
        ) : pricingPending ? (
          <p role="status" className="text-sm text-text-muted">
            Updating price…
          </p>
        ) : estimate?.kind === "contact_sales" ? (
          <p className="text-sm text-text-muted">
            Over 250 pupils needs a tailored quote.
          </p>
        ) : (
          <ProposedCharge quote={quote} estimate={estimate} />
        )}
      </div>
      {priceError && (
        <Button size="sm" onClick={onRetry}>
          Retry pricing
        </Button>
      )}
    </Card>
  );
}
