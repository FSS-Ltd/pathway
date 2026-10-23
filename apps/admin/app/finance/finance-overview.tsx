import Link from "next/link";
import { Badge, Card } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
import type {
  FinanceInvoice,
  FinanceReceipt,
} from "@/lib/finance-workspace-client";
import type { FinanceReportSummary } from "@/lib/finance-report-client";
import { formatFinanceMoney } from "./finance-format";

type FinanceOverviewTab = "invoices" | "payments";

export function FinanceOverview({
  summary,
  invoices,
  receipts,
  isLoading,
  onNavigate,
}: {
  summary: FinanceReportSummary | null;
  invoices: FinanceInvoice[];
  receipts: FinanceReceipt[];
  isLoading: boolean;
  onNavigate: (tab: FinanceOverviewTab) => void;
}) {
  const currency = summary?.metadata.currency ?? null;
  const totals = summary?.totals;
  const reviewCount = receipts.filter(
    (receipt) =>
      receipt.status === "PROCESSING" ||
      receipt.status === "FAILED" ||
      BigInt(receipt.unappliedMinor) > 0n,
  ).length;
  const metrics = [
    {
      label: "Outstanding",
      value: totals?.outstandingMinor,
      detail: "Issued balance after credits and confirmed allocations",
      tab: "invoices" as const,
    },
    {
      label: "Overdue",
      value: totals?.overdueMinor,
      detail: `Open invoices due before ${summary?.metadata.asOfDate ?? "the as-of date"}`,
      tab: "invoices" as const,
    },
    {
      label: "Processing",
      value: totals?.processingMinor,
      detail: "Pending receipts remain separate from confirmed funds",
      tab: "payments" as const,
    },
    {
      label: "Review required",
      value: totals?.reviewRequiredMinor,
      detail:
        "Manual receipts, refunds, failed or unmatched payments, and unapplied funds",
      tab: "payments" as const,
    },
  ];

  if (isLoading && !summary) {
    return (
      <p
        role="status"
        className="rounded-lg bg-muted p-4 text-sm text-text-muted"
      >
        Loading Finance overview…
      </p>
    );
  }
  if (!summary || !totals) {
    return (
      <Card
        title="Set up the Finance account"
        description="Add the school’s legal entity and collection currency before issuing invoices."
      >
        <Button asChild>
          <Link href="/finance/settings">Open Finance settings</Link>
        </Button>
      </Card>
    );
  }

  return (
    <section className="space-y-5" aria-label="Finance overview">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <button
            key={metric.label}
            type="button"
            onClick={() => onNavigate(metric.tab)}
            className="rounded-xl border border-border-subtle bg-surface p-4 text-left shadow-sm outline-none transition-colors hover:border-accent-strong/40 focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2"
          >
            <span className="text-sm font-medium text-text-muted">
              {metric.label}
            </span>
            <span className="mt-3 block font-heading text-2xl font-semibold tracking-tight text-text-primary">
              {metric.value === undefined
                ? "—"
                : formatFinanceMoney(metric.value, currency)}
            </span>
            <span className="mt-2 block text-xs leading-5 text-text-muted">
              {metric.detail}
            </span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Collection summary"
          description={`Period ${summary.metadata.from} to ${summary.metadata.to}. Balances are as of ${summary.metadata.asOfDate} (${summary.metadata.timeZone}).`}
        >
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <Measure
              label="Issued gross"
              value={totals.issuedGrossMinor}
              currency={currency}
            />
            <Measure
              label="Credits issued"
              value={totals.creditsMinor}
              currency={currency}
            />
            <Measure
              label="Confirmed receipts"
              value={totals.confirmedReceiptsMinor}
              currency={currency}
            />
            <Measure
              label="Allocated receipts"
              value={totals.allocatedReceiptsMinor}
              currency={currency}
            />
            <Measure
              label="Refunds and returns"
              value={totals.refundsAndReturnsMinor}
              currency={currency}
            />
            <Measure
              label="Unapplied funds"
              value={totals.unappliedMinor}
              currency={currency}
            />
          </dl>
          <p className="mt-4 text-xs text-text-muted">
            Updated{" "}
            {new Intl.DateTimeFormat("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
              timeZone: "Europe/London",
            }).format(new Date(summary.metadata.generatedAt))}
            . Processing funds are not included in confirmed receipts.
          </p>
        </Card>

        <Card
          title="Connected Stripe account"
          description="Processor fees and payouts come from the school’s connected Stripe account and are kept separate from family debt."
        >
          {summary.provider.status === "CONNECTED" ? (
            <div className="space-y-3 text-sm">
              <Badge variant="success">Connected</Badge>
              <dl className="space-y-2">
                {summary.provider.feesByCurrency.map((fee) => (
                  <Measure
                    key={fee.currency}
                    label={`Processor fees · ${fee.currency}`}
                    value={fee.amountMinor}
                    currency={fee.currency}
                  />
                ))}
                {summary.provider.payouts.slice(0, 4).map((payout) => (
                  <Measure
                    key={payout.id}
                    label={`Payout · ${payout.status}`}
                    value={payout.amountMinor}
                    currency={payout.currency}
                  />
                ))}
                {summary.provider.payouts.length === 0 &&
                summary.provider.feesByCurrency.length === 0 ? (
                  <p className="text-text-muted">
                    No Stripe fee or payout activity was found for this period.
                  </p>
                ) : null}
              </dl>
              <p className="text-xs text-text-muted">
                Stripe data checked{" "}
                {summary.provider.fetchedAt
                  ? new Intl.DateTimeFormat("en-GB", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Europe/London",
                    }).format(new Date(summary.provider.fetchedAt))
                  : "—"}
                .
              </p>
            </div>
          ) : (
            <p className="text-sm leading-6 text-text-muted">
              {summary.provider.status === "NOT_CONNECTED"
                ? "Connect a school Stripe account in Finance settings to reconcile processor fees and payouts."
                : "Stripe report data is temporarily unavailable. Retry the report after checking the connection."}
            </p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Invoices"
          description={`${invoices.length} recent invoice${invoices.length === 1 ? "" : "s"}.`}
        >
          {invoices.length ? (
            <button
              type="button"
              onClick={() => onNavigate("invoices")}
              className="text-sm font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            >
              Review invoices
            </button>
          ) : (
            <p className="text-sm text-text-muted">
              No invoices yet. Start with a draft and review the
              server-calculated total before issue.
            </p>
          )}
        </Card>
        <Card
          title="Recent receipt checks"
          description="Processing receipts need status checks; failed and unapplied funds need a safe next step."
        >
          <p className="text-sm text-text-muted">
            {reviewCount} item{reviewCount === 1 ? "" : "s"} in the recent
            receipt list need attention.
          </p>
          <button
            type="button"
            onClick={() => onNavigate("payments")}
            className="mt-3 text-sm font-semibold text-text-primary outline-none focus-visible:ring-2 focus-visible:ring-status-info"
          >
            Open payment review
          </button>
        </Card>
      </div>
    </section>
  );
}

function Measure({
  label,
  value,
  currency,
}: {
  label: string;
  value: string;
  currency: string | null;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border-subtle pb-2 last:border-0">
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-text-primary">
        {formatFinanceMoney(value, currency)}
      </dd>
    </div>
  );
}
