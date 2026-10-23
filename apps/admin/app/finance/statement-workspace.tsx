"use client";

import React from "react";
import { Card } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
import {
  downloadFinanceStatement,
  requestFinanceStatement,
  type FinancePayerAccount,
  type FinanceStatement,
} from "@/lib/finance-workspace-client";
import {
  addDateDays,
  currentFinanceFilters,
  fileFromBlob,
  formatFinanceDate,
  formatFinanceMoney,
  londonMidnightIso,
} from "./finance-format";

export function FinanceStatementWorkspace({
  statements,
  payerAccounts,
  hasMorePayerAccounts,
  isLoadingMorePayerAccounts,
  onLoadMorePayerAccounts,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
  onRefresh,
}: {
  statements: FinanceStatement[];
  payerAccounts: FinancePayerAccount[];
  hasMorePayerAccounts: boolean;
  isLoadingMorePayerAccounts: boolean;
  onLoadMorePayerAccounts: () => Promise<void>;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const filters = React.useMemo(currentFinanceFilters, []);
  const [payerAccountId, setPayerAccountId] = React.useState(
    payerAccounts[0]?.id ?? "",
  );
  const [from, setFrom] = React.useState(filters.from);
  const [to, setTo] = React.useState(filters.to);
  const [pending, setPending] = React.useState(false);
  const [downloadId, setDownloadId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!payerAccountId && payerAccounts[0])
      setPayerAccountId(payerAccounts[0].id);
  }, [payerAccountId, payerAccounts]);

  const request = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!payerAccountId || from > to) {
      setError("Choose a payer account and a valid date range.");
      return;
    }
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      await requestFinanceStatement({
        payerAccountId,
        periodStart: londonMidnightIso(from),
        periodEnd: new Date(
          Math.min(
            new Date(londonMidnightIso(addDateDays(to, 1))).getTime(),
            Date.now(),
          ),
        ).toISOString(),
      });
      setMessage(
        "Statement generated. It is available in the statement history below.",
      );
      await onRefresh();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Statement could not be generated.",
      );
    } finally {
      setPending(false);
    }
  };

  const download = async (statement: FinanceStatement) => {
    setDownloadId(statement.id);
    setError(null);
    try {
      const blob = await downloadFinanceStatement(statement.id);
      fileFromBlob(
        `finance-statement-${statement.periodStart.slice(0, 10)}.pdf`,
        blob,
      );
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Statement could not be downloaded.",
      );
    } finally {
      setDownloadId(null);
    }
  };

  return (
    <section className="space-y-5" aria-label="Finance statements">
      <header>
        <h2 className="font-heading text-xl font-semibold text-text-primary">
          Statements
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Generate a frozen statement for an authorised payer account and date
          range. Later corrections appear as dated movements in a later
          statement.
        </p>
      </header>

      <Card
        title="Request a statement"
        description="The statement records its ledger cutoff and can be downloaded only while access remains authorised."
      >
        <form
          onSubmit={(event) => void request(event)}
          className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <div className="space-y-2 xl:col-span-2">
            <label
              htmlFor="finance-statement-payer"
              className="text-sm font-medium text-text-primary"
            >
              Payer account
            </label>
            <select
              id="finance-statement-payer"
              required
              value={payerAccountId}
              onChange={(event) => setPayerAccountId(event.target.value)}
              disabled={pending || payerAccounts.length === 0}
              className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            >
              <option value="">Select a payer account</option>
              {payerAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                </option>
              ))}
            </select>
            {hasMorePayerAccounts ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => void onLoadMorePayerAccounts()}
                disabled={isLoadingMorePayerAccounts || pending}
              >
                {isLoadingMorePayerAccounts
                  ? "Loading payer accounts…"
                  : "Load more payer accounts"}
              </Button>
            ) : null}
          </div>
          <div className="space-y-2">
            <label
              htmlFor="finance-statement-from"
              className="text-sm font-medium text-text-primary"
            >
              From
            </label>
            <input
              id="finance-statement-from"
              type="date"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              disabled={pending}
              className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            />
          </div>
          <div className="space-y-2">
            <label
              htmlFor="finance-statement-to"
              className="text-sm font-medium text-text-primary"
            >
              To
            </label>
            <input
              id="finance-statement-to"
              type="date"
              required
              value={to}
              onChange={(event) => setTo(event.target.value)}
              disabled={pending}
              className="h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-status-info"
            />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2 xl:col-span-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-5 text-text-muted">
              Dates are interpreted in Europe/London. Closing balance is
              calculated from the shared invoice ledger.
            </p>
            <Button
              type="submit"
              disabled={pending || !payerAccountId || from > to}
            >
              {pending ? "Generating…" : "Generate statement"}
            </Button>
          </div>
        </form>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        {message ? (
          <p role="status" className="mt-3 text-sm text-text-primary">
            {message}
          </p>
        ) : null}
        {payerAccounts.length === 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Create a payer account in the Invoices section before requesting a
            statement.
          </p>
        ) : null}
      </Card>

      <Card
        title="Statement history"
        description="Month-end statements are immutable. Download requests are re-authorised by the server."
      >
        {isLoading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading statements…
          </p>
        ) : statements.length === 0 ? (
          <p className="py-4 text-sm text-text-muted">
            No statements are available for this Finance account yet.
          </p>
        ) : (
          <div className="relative overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-sm">
              <caption className="sr-only">Finance statement history</caption>
              <thead className="border-b border-border-subtle text-xs uppercase tracking-wide text-text-muted">
                <tr>
                  <th scope="col" className="px-3 py-3">
                    Period
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Kind
                  </th>
                  <th scope="col" className="px-3 py-3">
                    Status
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Closing balance
                  </th>
                  <th scope="col" className="px-3 py-3 text-right">
                    Lines
                  </th>
                  <th scope="col" className="px-3 py-3">
                    <span className="sr-only">Download</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {statements.map((statement) => (
                  <StatementRow
                    key={statement.id}
                    statement={statement}
                    pending={downloadId === statement.id}
                    onDownload={() => void download(statement)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
        {hasMore ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => void onLoadMore()}
              disabled={isLoadingMore}
            >
              {isLoadingMore ? "Loading statements…" : "Load more statements"}
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}

function StatementRow({
  statement,
  pending,
  onDownload,
}: {
  statement: FinanceStatement;
  pending: boolean;
  onDownload: () => void;
}) {
  return (
    <tr>
      <td className="px-3 py-3 text-text-primary">
        {formatFinanceDate(statement.periodStart)} –{" "}
        {formatFinanceDate(
          new Date(new Date(statement.periodEnd).getTime() - 1).toISOString(),
        )}
      </td>
      <td className="px-3 py-3 text-text-muted">
        {statement.kind.replaceAll("_", " ").toLowerCase()}
      </td>
      <td className="px-3 py-3 capitalize text-text-primary">
        {statement.status.toLowerCase()}
      </td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums">
        {formatFinanceMoney(
          statement.totals.closingBalanceMinor,
          statement.currency,
        )}
      </td>
      <td className="px-3 py-3 text-right tabular-nums text-text-muted">
        {statement.lineCount}
      </td>
      <td className="px-3 py-3 text-right">
        <Button
          size="sm"
          variant="secondary"
          onClick={onDownload}
          disabled={pending}
        >
          {pending ? "Preparing…" : "Download"}
        </Button>
      </td>
    </tr>
  );
}
