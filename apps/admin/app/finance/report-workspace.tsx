"use client";
import { ProviderEvidenceSummary } from "./provider-evidence-summary";

import React from "react";
import { ApiError } from "@/lib/api-transport";
import { Card } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
import {
  downloadFinanceReport,
  fetchFinanceReport,
  type FinanceReport,
  type FinanceReportFilters,
  type FinanceReportRow,
  type FinanceReportType,
} from "@/lib/finance-report-client";
import {
  fileFromBlob,
  formatFinanceDate,
  formatFinanceDateTime,
  formatFinanceMoney,
} from "./finance-format";

const reportOptions: Array<{ id: FinanceReportType; label: string }> = [
  { id: "receivables-ageing", label: "Receivables ageing" },
  { id: "receipts-allocation", label: "Receipts and allocation" },
  { id: "exceptions", label: "Financial exceptions" },
  { id: "payout-reconciliation", label: "Payout reconciliation" },
];

export function FinanceReportWorkspace({
  canExport,
  initialFilters,
  onAccessDenied,
}: {
  canExport: boolean;
  initialFilters: FinanceReportFilters;
  onAccessDenied?: () => void;
}) {
  const [filters, setFilters] = React.useState(initialFilters);
  const [type, setType] =
    React.useState<FinanceReportType>("receivables-ageing");
  const [report, setReport] = React.useState<FinanceReport | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isExporting, setIsExporting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [exportMessage, setExportMessage] = React.useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = React.useState(false);

  const requestSequence = React.useRef(0);
  React.useEffect(
    () => () => {
      requestSequence.current += 1;
    },
    [],
  );
  const resetSelection = () => {
    requestSequence.current += 1;
    setIsLoading(false);
    setReport(null);
    setHasLoaded(false);
    setError(null);
    setExportMessage(null);
  };

  const load = React.useCallback(async () => {
    if (filters.from > filters.to) {
      setError("The end date must be on or after the start date.");
      return;
    }
    const sequence = ++requestSequence.current;
    setIsLoading(true);
    setError(null);
    setExportMessage(null);
    try {
      const nextReport = await fetchFinanceReport(type, filters);
      if (sequence !== requestSequence.current) return;
      setReport(nextReport);
      setHasLoaded(true);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        setReport(null);
        setHasLoaded(false);
        onAccessDenied?.();
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Report could not be loaded.",
      );
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [filters, onAccessDenied, type]);

  const exportCsv = async () => {
    if (!report || !hasLoaded || isExporting || isLoading) return;
    const sequence = requestSequence.current;
    setIsExporting(true);
    setError(null);
    setExportMessage(
      "Preparing the scoped CSV and recording the export audit event…",
    );
    try {
      const result = await downloadFinanceReport(type, filters);
      if (sequence !== requestSequence.current) return;
      fileFromBlob(result.filename, result.blob);
      setExportMessage(`Downloaded ${result.filename}.`);
    } catch (caught) {
      if (sequence !== requestSequence.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        setReport(null);
        setHasLoaded(false);
        onAccessDenied?.();
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Export could not be created.",
      );
      setExportMessage(null);
    } finally {
      setIsExporting(false);
    }
  };

  const metadata = report?.metadata;
  const currency = report?.metadata.currency ?? null;

  return (
    <section className="space-y-5" aria-label="Finance reports">
      <header>
        <h2 className="font-heading text-xl font-semibold text-text-primary">
          Reports
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          All balances use the same ledger projection as invoice detail and
          statements. Provider fees and payouts are shown separately from family
          debt.
        </p>
      </header>

      <Card
        title="Choose a report"
        description="Activity dates and ageing use Europe/London. The as-of date controls open balances and unresolved exceptions."
      >
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <div className="space-y-2 xl:col-span-2">
            <label
              htmlFor="finance-report-type"
              className="text-sm font-medium text-text-primary"
            >
              Report
            </label>
            <select
              id="finance-report-type"
              value={type}
              disabled={isExporting}
              onChange={(event) => {
                setType(event.target.value as FinanceReportType);
                resetSelection();
              }}
              className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            >
              {reportOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <DateField
            label="From"
            id="finance-report-from"
            disabled={isExporting}
            value={filters.from}
            onChange={(from) => {
              setFilters((current) => ({ ...current, from }));
              resetSelection();
            }}
          />
          <DateField
            label="To"
            id="finance-report-to"
            disabled={isExporting}
            value={filters.to}
            onChange={(to) => {
              setFilters((current) => ({ ...current, to }));
              resetSelection();
            }}
          />
          <DateField
            label="As of"
            id="finance-report-as-of"
            disabled={isExporting}
            value={filters.asOf}
            onChange={(asOf) => {
              setFilters((current) => ({ ...current, asOf }));
              resetSelection();
            }}
          />
        </div>
        <div className="mt-4 flex flex-col gap-2 border-t border-border-subtle pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-5 text-text-muted">
            Currency: {currency ?? "not configured"} · Scope:{" "}
            {metadata?.legalEntityName ?? "school Finance legal entity"} ·
            Generated:{" "}
            {metadata ? formatFinanceDateTime(metadata.generatedAt) : "—"}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={isLoading || isExporting}
            >
              {isLoading ? "Updating…" : "Run report"}
            </Button>
            {canExport ? (
              <Button
                onClick={() => void exportCsv()}
                disabled={isExporting || isLoading || !hasLoaded || !report}
              >
                {isExporting ? "Preparing export…" : "Export CSV"}
              </Button>
            ) : null}
          </div>
        </div>
        {error ? (
          <div
            role="alert"
            className="mt-3 rounded-lg border border-status-danger/20 bg-status-danger/5 p-3 text-sm text-text-primary"
          >
            <p>{error}</p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-2"
              onClick={() => void load()}
              disabled={isLoading || isExporting}
            >
              Retry report
            </Button>
          </div>
        ) : null}
        {exportMessage ? (
          <p role="status" className="mt-3 text-sm text-text-muted">
            {exportMessage}
          </p>
        ) : null}
      </Card>

      {report?.totals ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Issued gross"
            value={report.totals.issuedGrossMinor}
            currency={currency}
          />
          <Metric
            label="Credits"
            value={report.totals.creditsMinor}
            currency={currency}
          />
          <Metric
            label="Confirmed receipts"
            value={report.totals.confirmedReceiptsMinor}
            currency={currency}
          />
          <Metric
            label="Refunds"
            value={report.totals.refundsMinor}
            currency={currency}
          />
          <Metric
            label="Returns and reinstatements"
            value={report.totals.returnsMinor}
            currency={currency}
          />
          <Metric
            label="Allocated receipts"
            value={report.totals.allocatedReceiptsMinor}
            currency={currency}
          />
          <Metric
            label="Outstanding as of date"
            value={report.totals.outstandingMinor}
            currency={currency}
          />
          <Metric
            label="Overdue as of date"
            value={report.totals.overdueMinor}
            currency={currency}
          />
          <Metric
            label="Unapplied confirmed funds"
            value={report.totals.unappliedMinor}
            currency={currency}
          />
        </div>
      ) : null}

      {report?.type === "payout-reconciliation" ? (
        <Card
          title="Stripe fees and payouts"
          description="These actual connected-account movements reconcile school settlement. They do not reduce family invoice balances."
        >
          <ProviderEvidenceSummary provider={report.provider} />
        </Card>
      ) : null}

      <Card
        title={
          reportOptions.find((option) => option.id === type)?.label ??
          "Finance report"
        }
        description={
          metadata?.reportingBasis ??
          "Run the report to see its date basis and ledger cutoff."
        }
      >
        {isLoading && !report ? (
          <p role="status" className="text-sm text-text-muted">
            Loading report…
          </p>
        ) : !hasLoaded ? (
          <p className="text-sm text-text-muted">
            Choose filters and run the report.
          </p>
        ) : report?.rows.length ? (
          <>
            {type === "exceptions" ? (
              <NextException row={report.rows[0]} />
            ) : null}
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[1040px] text-left text-sm">
                <caption className="sr-only">
                  {reportOptions.find((option) => option.id === type)?.label}{" "}
                  report rows
                </caption>
                <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-muted">
                  <tr>
                    <th scope="col" className="px-3 py-3">
                      Reference
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Date
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Payer
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Status
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      Amount
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      Outstanding
                    </th>
                    <th scope="col" className="px-3 py-3 text-right">
                      Processor fee
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Age
                    </th>
                    <th scope="col" className="px-3 py-3">
                      Description
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {report.rows.map((row, index) => (
                    <ReportTableRow
                      key={`${row.reference}-${row.date ?? index}-${index}`}
                      row={row}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-text-muted">
              Showing {report.rows.length} rows · Period {metadata?.from} to{" "}
              {metadata?.to} · As of {metadata?.asOfDate} · Ledger cutoff{" "}
              {formatFinanceDateTime(metadata?.ledgerCutoffAt)} · Data generated{" "}
              {formatFinanceDateTime(metadata?.generatedAt)}.
            </p>
          </>
        ) : (
          <p className="py-4 text-sm text-text-muted">
            No rows match the selected report basis and filters.
          </p>
        )}
      </Card>

      <Card
        title="Measure definitions"
        description="Each measure has one date basis. Payouts and processor fees remain separate from family debt."
      >
        <dl className="grid gap-x-6 gap-y-3 text-sm md:grid-cols-2">
          <Definition
            label="Issued gross"
            text="Invoice face value by issue date, before credits."
          />
          <Definition
            label="Credits"
            text="Issued credit notes by issue date; kept separate from gross."
          />
          <Definition
            label="Confirmed receipts"
            text="Receipts by confirmed date, before allocation."
          />
          <Definition
            label="Refunds"
            text="Confirmed refund outflows and dispute withdrawals by movement date."
          />
          <Definition
            label="Returns and reinstatements"
            text="Confirmed refund returns and dispute reinstatements by movement date, kept separate from the original refund."
          />
          <Definition
            label="Allocated receipts"
            text="Confirmed receipt allocations in the selected date window, net of allocation reversals by the ledger cutoff."
          />
          <Definition
            label="Outstanding and overdue"
            text="Open issued balance at the as-of cutoff; overdue means due before the selected Europe/London as-of date."
          />
          <Definition
            label="Unapplied"
            text="Confirmed receipt funds not allocated at the as-of cutoff, shown separately from debt."
          />
          <Definition
            label="Processor fees and payouts"
            text="Actual Stripe connected-account evidence, fetched by account and grouped by provider currency."
          />
        </dl>
      </Card>
    </section>
  );
}

function DateField({
  label,
  id,
  value,
  onChange,
  disabled,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium text-text-primary">
        {label}
      </label>
      <input
        id={id}
        type="date"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-status-info"
      />
    </div>
  );
}

function Metric({
  label,
  value,
  currency,
}: {
  label: string;
  value: string;
  currency: string | null;
}) {
  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <p className="text-xs font-medium text-text-muted">{label}</p>
      <p className="mt-2 font-heading text-xl font-semibold tabular-nums text-text-primary">
        {formatFinanceMoney(value, currency)}
      </p>
    </div>
  );
}

function ReportTableRow({ row }: { row: FinanceReportRow }) {
  const amount =
    row.amountMinor && row.currency
      ? formatFinanceMoney(row.amountMinor, row.currency)
      : "—";
  const outstanding =
    row.outstandingMinor && row.currency
      ? formatFinanceMoney(row.outstandingMinor, row.currency)
      : "—";
  const fee =
    row.feeMinor && row.currency
      ? formatFinanceMoney(row.feeMinor, row.currency)
      : "—";
  return (
    <tr>
      <td className="px-3 py-3 font-medium text-text-primary">
        {row.reference}
      </td>
      <td className="px-3 py-3 text-text-muted">
        {formatFinanceDate(row.date)}
      </td>
      <td className="px-3 py-3 text-text-primary">{row.payerName ?? "—"}</td>
      <td className="px-3 py-3 capitalize text-text-primary">
        {row.status.replaceAll("_", " ").toLowerCase()}
      </td>
      <td className="px-3 py-3 text-right tabular-nums">{amount}</td>
      <td className="px-3 py-3 text-right tabular-nums">{outstanding}</td>
      <td className="px-3 py-3 text-right tabular-nums">{fee}</td>
      <td className="px-3 py-3 text-text-muted">
        {row.ageingBucket
          ? `${row.ageingBucket.replaceAll("_", " ").toLowerCase()} · ${row.overdueDays ?? 0} days`
          : row.dueDate
            ? `Due ${formatFinanceDate(row.dueDate)}`
            : "—"}
      </td>
      <td className="max-w-sm px-3 py-3 text-text-muted">{row.description}</td>
    </tr>
  );
}

function NextException({ row }: { row: FinanceReportRow | undefined }) {
  if (!row) return null;
  const status = row.status.toLowerCase().replaceAll("_", " ");
  const nextAction =
    status === "processing"
      ? "Wait for provider confirmation. Do not allocate this amount or ask the payer to pay again."
      : status === "pending review"
        ? "Review bank evidence independently before recording a receipt. A payer notice alone is not evidence."
        : status === "unapplied funds"
          ? "Match the confirmed funds to an invoice only after checking payer, amount and currency. Leave excess unapplied."
          : status === "failed"
            ? "Check the provider result and leave the invoice balance unchanged until confirmed funds arrive."
            : "Review the source evidence and use the linked Finance action that matches the current status.";
  return (
    <div className="mb-4 rounded-xl border border-status-warn/30 bg-status-warn/5 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        Next exception
      </p>
      <p className="mt-1 font-semibold text-text-primary">
        {row.reference} · {row.status.replaceAll("_", " ").toLowerCase()}
      </p>
      <p className="mt-1 text-sm leading-6 text-text-muted">{nextAction}</p>
    </div>
  );
}

function Definition({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="font-semibold text-text-primary">{label}</dt>
      <dd className="mt-1 leading-5 text-text-muted">{text}</dd>
    </div>
  );
}
