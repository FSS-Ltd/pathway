import { Card } from "@pathway/ui";
import {
  mappedInstitutionalPlanDetails,
  type InstitutionalMappedPlanCode,
  type InstitutionalMappedQuoteLine,
  type InstitutionalQuoteLine,
} from "@pathway/pricing";
import type { InstitutionalSummary } from "../../lib/institutional-billing-client";

export const money = (pence: number | null) =>
  pence === null
    ? "Under review"
    : new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency: "GBP",
      }).format(pence / 100);
export const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "Not set";
export const planName = (code: InstitutionalMappedPlanCode) =>
  mappedInstitutionalPlanDetails(code).tier;
export const billingPeriod = (code: InstitutionalMappedPlanCode) =>
  mappedInstitutionalPlanDetails(code).interval === "year" ? "year" : "month";

type PriceLine = InstitutionalQuoteLine | InstitutionalMappedQuoteLine;

function PriceLines({ lines }: { lines: PriceLine[] }) {
  const labels: Record<PriceLine["component"], string> = {
    BASE: "Base",
    CHILDREN_UP_TO_100: "Additional children to 100",
    CHILDREN_101_TO_250: "Children 101–250",
    STORAGE: "Extra storage",
  };
  if (!lines.length) return null;
  return (
    <dl className="space-y-1 text-xs text-text-muted">
      {lines.map((line, index) => (
        <div key={index} className="flex justify-between gap-3">
          <dt>{labels[line.component]}</dt>
          <dd>{money(line.subtotalPence)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function InstitutionalSummaryCards({
  summary,
}: {
  summary: InstitutionalSummary;
}) {
  return (
    <>
      {summary.reviewReason ? (
        <p role="alert" className="rounded-lg bg-status-warning/10 p-4 text-sm">
          Billing needs review:{" "}
          {summary.reviewReason.replaceAll("_", " ").toLowerCase()}. Your last
          agreed charge remains in place.
        </p>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Current paid period">
          {summary.currentPaid ? (
            <div className="space-y-2 text-sm">
              <p className="text-xl font-bold capitalize">
                {planName(summary.currentPaid.planCode)}
              </p>
              <p>
                {money(summary.currentPaid.subtotalPence)} payable per{" "}
                {billingPeriod(summary.currentPaid.planCode)}
              </p>
              <PriceLines lines={summary.currentPaid.lines} />
              <p className="text-text-muted">
                {summary.currentPaid.enrolledChildren ?? "Unconfirmed"} enrolled
                children · {summary.currentPaid.includedChildren ?? "—"}{" "}
                included
              </p>
              <p className="text-text-muted">
                Through {date(summary.currentPaid.periodEnd)}
              </p>
              <p className="text-text-muted">
                Included modules:{" "}
                {summary.currentPaid.includedModules.join(", ") || "None"}
              </p>
              <p className="text-text-muted">
                Paid extras:{" "}
                {summary.currentPaid.paidModules.join(", ") || "None"}
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              No enrolled-child subscription is active yet.
            </p>
          )}
        </Card>
        <Card title="Live roll estimate">
          {summary.liveForecast?.kind === "priced" ? (
            <div className="space-y-2 text-sm">
              <p className="text-xl font-bold">
                {money(summary.liveForecast.subtotalPence)} payable per{" "}
                {billingPeriod(summary.liveForecast.planCode)}
              </p>
              <p className="text-text-muted">
                {summary.liveForecast.enrolledChildren} enrolled ·{" "}
                {summary.liveForecast.includedChildren} included
              </p>
              <PriceLines lines={[...summary.liveForecast.lines]} />
              <p className="text-text-muted">
                This may change before the census.
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              {summary.liveForecast?.kind === "contact_sales"
                ? "More than 250 children requires a custom quote."
                : "Confirm the continuing roll to see a live estimate."}
            </p>
          )}
        </Card>
        <Card title="Frozen next renewal">
          {summary.frozenRenewal ? (
            <div className="space-y-2 text-sm">
              <p className="text-xl font-bold">
                {money(summary.frozenRenewal.subtotalPence)} payable per{" "}
                {billingPeriod(summary.frozenRenewal.planCode)}
              </p>
              <PriceLines lines={summary.frozenRenewal.lines} />
              <p className="text-text-muted capitalize">
                {planName(summary.frozenRenewal.planCode)} ·{" "}
                {summary.frozenRenewal.enrolledChildren ?? "Unconfirmed"}{" "}
                enrolled
              </p>
              <p className="text-text-muted">
                Included modules:{" "}
                {summary.frozenRenewal.includedModules.join(", ") || "None"}
              </p>
              <p className="text-text-muted">
                Paid extras:{" "}
                {summary.frozenRenewal.paidModules.join(", ") || "None"}
              </p>
              <p className="text-text-muted">
                Effective {date(summary.frozenRenewal.effectiveAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-text-muted">
              The next renewal has not been frozen.
            </p>
          )}
          <p className="mt-3 text-xs text-text-muted">
            Next census cutoff: {date(summary.nextCutoffAt)}
          </p>
        </Card>
      </div>
      {summary.scheduledChange ? (
        <Card title="Accepted change">
          <p className="text-sm text-text-muted capitalize">
            {planName(summary.scheduledChange.planCode)} was accepted on{" "}
            {date(summary.scheduledChange.acceptedAt)}.{" "}
            {summary.scheduledChange.effectiveAt
              ? `Eligible from ${date(summary.scheduledChange.effectiveAt)}.`
              : "It will apply at a later eligible renewal."}
          </p>
        </Card>
      ) : null}
    </>
  );
}
