import React from "react";
import type { FinanceReport } from "@/lib/finance-report-client";
import { formatFinanceDateTime, formatFinanceMoney } from "./finance-format";

export function ProviderEvidenceSummary({
  provider,
}: {
  provider: FinanceReport["provider"];
}) {
  if (!provider?.context)
    return (
      <p className="text-sm text-text-muted">
        {provider?.status === "NOT_CONNECTED"
          ? "No school Stripe account has been recorded for this report."
          : "Saved Stripe evidence is unavailable for the selected account and environment. Check servicing configuration and reconciliation coverage."}
      </p>
    );
  return (
    <div className="space-y-3">
      {provider.status === "UNAVAILABLE" ? (
        <p role="status" className="text-sm text-text-muted">
          Provider access is unavailable. Saved evidence remains available for
          servicing; check the account status and observation cutoffs.
        </p>
      ) : null}
      <p className="text-xs text-text-muted">
        Saved provider evidence last observed{" "}
        {formatFinanceDateTime(provider.fetchedAt)}. Freshness:{" "}
        {provider.freshness.toLowerCase().replaceAll("_", " ")}.
      </p>
      <p className="text-xs text-text-muted">
        Earliest historical coverage is unproven. Stream cutoffs describe saved
        observations; a successful sync does not prove full period coverage.
        {provider.truncated
          ? " This report reached its row limit; fee totals and payout rows are partial."
          : ""}
      </p>
      {provider.context ? (
        <p className="text-xs text-text-muted">
          Account {provider.context.accountId} ·{" "}
          {provider.context.livemode ? "Live" : "Test"}
        </p>
      ) : null}
      <ul className="space-y-1 text-xs text-text-muted">
        {provider.coverage.map((stream) => (
          <li key={stream.stream}>
            {stream.stream === "payouts" ? "Payouts" : "Balance transactions"}:
            completed through {formatFinanceDateTime(stream.completedThrough)};
            last successful sync {formatFinanceDateTime(stream.lastSucceededAt)}
            .
          </li>
        ))}
      </ul>
      {provider.feesByCurrency.length ? (
        <ul className="grid gap-2 sm:grid-cols-2">
          {provider.feesByCurrency.map((fee) => (
            <li
              key={fee.currency}
              className="rounded-lg border border-border-subtle p-3"
            >
              <p className="text-xs text-text-muted">
                Processor fees · {fee.currency}
              </p>
              <p className="mt-1 font-semibold tabular-nums text-text-primary">
                {formatFinanceMoney(fee.amountMinor, fee.currency)}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-text-muted">
          No processor fee evidence has been saved for this period.
        </p>
      )}
    </div>
  );
}
