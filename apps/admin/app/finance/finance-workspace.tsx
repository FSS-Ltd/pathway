"use client";

import Link from "next/link";
import React from "react";
import { Button, Card } from "@pathway/ui";
import { ApiError } from "@/lib/api-transport";
import {
  fetchFinanceInvoices,
  fetchFinancePayerAccounts,
  fetchFinanceReceipts,
  fetchFinanceStatements,
  type FinanceInvoice,
  type FinancePayerAccount,
  type FinanceReceipt,
  type FinanceStatement,
} from "@/lib/finance-workspace-client";
import {
  fetchFinanceReportSummary,
  type FinanceReportSummary,
} from "@/lib/finance-report-client";
import { currentFinanceFilters } from "./finance-format";
import { FinanceOverview } from "./finance-overview";
import { FinanceInvoiceWorkspace } from "./invoice-workspace";
import { FinancePaymentWorkspace } from "./payment-workspace";
import { FinanceStatementWorkspace } from "./statement-workspace";
import { FinanceReportWorkspace } from "./report-workspace";

type FinanceTab =
  | "overview"
  | "invoices"
  | "payments"
  | "statements"
  | "reports";

type FinanceWorkspaceProps = {
  canCreateInvoices: boolean;
  canManageAllocations: boolean;
  canReviewInvoices: boolean;
  canExport: boolean;
  canReadStatements: boolean;
  canReadSettings: boolean;
  showUpgradeIfLocked: boolean;
};

export function FinanceWorkspace({
  canCreateInvoices,
  canManageAllocations,
  canReviewInvoices,
  canExport,
  canReadStatements,
  canReadSettings,
  showUpgradeIfLocked,
}: FinanceWorkspaceProps) {
  const [activeTab, setActiveTab] = React.useState<FinanceTab>("overview");
  const [summary, setSummary] = React.useState<FinanceReportSummary | null>(
    null,
  );
  const [invoices, setInvoices] = React.useState<FinanceInvoice[]>([]);
  const [receipts, setReceipts] = React.useState<FinanceReceipt[]>([]);
  const [statements, setStatements] = React.useState<FinanceStatement[]>([]);
  const [invoiceCursor, setInvoiceCursor] = React.useState<string | null>(null);
  const [receiptCursor, setReceiptCursor] = React.useState<string | null>(null);
  const [statementCursor, setStatementCursor] = React.useState<string | null>(
    null,
  );
  const [loadingMoreInvoices, setLoadingMoreInvoices] = React.useState(false);
  const [loadingMoreReceipts, setLoadingMoreReceipts] = React.useState(false);
  const [loadingMoreStatements, setLoadingMoreStatements] =
    React.useState(false);
  const [payerAccounts, setPayerAccounts] = React.useState<
    FinancePayerAccount[]
  >([]);
  const [payerAccountCursor, setPayerAccountCursor] = React.useState<
    string | null
  >(null);
  const [loadingMorePayerAccounts, setLoadingMorePayerAccounts] =
    React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [financeLocked, setFinanceLocked] = React.useState(false);
  const filters = React.useMemo(currentFinanceFilters, []);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setFinanceLocked(false);
    let summaryLoaded = false;
    try {
      const nextSummary = await fetchFinanceReportSummary(filters);
      summaryLoaded = true;
      const [invoicePage, receiptPage, payerPage, statementPage] =
        await Promise.all([
          fetchFinanceInvoices(),
          fetchFinanceReceipts(),
          fetchFinancePayerAccounts(),
          canReadStatements
            ? fetchFinanceStatements()
            : Promise.resolve({ items: [], nextCursor: null }),
        ]);
      setSummary(nextSummary);
      setInvoices(invoicePage.items);
      setInvoiceCursor(invoicePage.nextCursor);
      setReceipts(receiptPage.items);
      setReceiptCursor(receiptPage.nextCursor);
      setPayerAccounts(payerPage.items);
      setPayerAccountCursor(payerPage.nextCursor);
      setStatements(statementPage.items);
      setStatementCursor(statementPage.nextCursor);
    } catch (caught) {
      if (
        showUpgradeIfLocked &&
        !summaryLoaded &&
        caught instanceof ApiError &&
        caught.status === 403
      ) {
        setFinanceLocked(true);
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Finance could not be loaded.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [canReadStatements, filters, showUpgradeIfLocked]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const refreshInvoices = React.useCallback(async () => {
    const [invoicePage, payerPage] = await Promise.all([
      fetchFinanceInvoices(),
      fetchFinancePayerAccounts(),
    ]);
    setInvoices(invoicePage.items);
    setInvoiceCursor(invoicePage.nextCursor);
    setPayerAccounts(payerPage.items);
    setPayerAccountCursor(payerPage.nextCursor);
  }, []);

  const refreshReceipts = React.useCallback(async () => {
    const [receiptPage, invoicePage] = await Promise.all([
      fetchFinanceReceipts(),
      fetchFinanceInvoices(),
    ]);
    setReceipts(receiptPage.items);
    setReceiptCursor(receiptPage.nextCursor);
    setInvoices(invoicePage.items);
    setInvoiceCursor(invoicePage.nextCursor);
  }, []);

  const loadMoreInvoices = React.useCallback(async () => {
    if (!invoiceCursor || loadingMoreInvoices) return;
    setLoadingMoreInvoices(true);
    try {
      const page = await fetchFinanceInvoices(invoiceCursor);
      setInvoices((current) => appendUnique(current, page.items));
      setInvoiceCursor(page.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Invoices could not be loaded.",
      );
    } finally {
      setLoadingMoreInvoices(false);
    }
  }, [invoiceCursor, loadingMoreInvoices]);

  const loadMoreReceipts = React.useCallback(async () => {
    if (!receiptCursor || loadingMoreReceipts) return;
    setLoadingMoreReceipts(true);
    try {
      const page = await fetchFinanceReceipts(receiptCursor);
      setReceipts((current) => appendUnique(current, page.items));
      setReceiptCursor(page.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payments could not be loaded.",
      );
    } finally {
      setLoadingMoreReceipts(false);
    }
  }, [loadingMoreReceipts, receiptCursor]);

  const loadMoreStatements = React.useCallback(async () => {
    if (!statementCursor || loadingMoreStatements) return;
    setLoadingMoreStatements(true);
    try {
      const page = await fetchFinanceStatements(statementCursor);
      setStatements((current) => appendUnique(current, page.items));
      setStatementCursor(page.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Statements could not be loaded.",
      );
    } finally {
      setLoadingMoreStatements(false);
    }
  }, [loadingMoreStatements, statementCursor]);

  const loadMorePayerAccounts = React.useCallback(async () => {
    if (!payerAccountCursor || loadingMorePayerAccounts) return;
    setLoadingMorePayerAccounts(true);
    try {
      const page = await fetchFinancePayerAccounts(payerAccountCursor);
      setPayerAccounts((current) => appendUnique(current, page.items));
      setPayerAccountCursor(page.nextCursor);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Payer accounts could not be loaded.",
      );
    } finally {
      setLoadingMorePayerAccounts(false);
    }
  }, [loadingMorePayerAccounts, payerAccountCursor]);

  const tabs: Array<{ id: FinanceTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "invoices", label: "Invoices" },
    { id: "payments", label: "Payments & review" },
    ...(canReadStatements
      ? [{ id: "statements" as const, label: "Statements" }]
      : []),
    { id: "reports", label: "Reports" },
  ];
  const handleTabKeyDown = (
    event: React.KeyboardEvent<HTMLButtonElement>,
    currentTab: FinanceTab,
  ) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    const nextIndex =
      event.key === "ArrowRight"
        ? (currentIndex + 1) % tabs.length
        : event.key === "ArrowLeft"
          ? (currentIndex - 1 + tabs.length) % tabs.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? tabs.length - 1
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (!nextTab) return;
    setActiveTab(nextTab.id);
    document.getElementById(`finance-tab-${nextTab.id}`)?.focus();
  };

  if (financeLocked) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-accent">Finance</p>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            Family invoices and payments
          </h1>
        </header>
        <Card
          title="Finance is not included"
          description="Finance is a paid add-on for family invoices, payment allocation, statements and reports. Review the available options in Billing."
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/billing">View Billing</Link>
            </Button>
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={isLoading}
            >
              {isLoading ? "Checking access…" : "Check access again"}
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 p-4 sm:p-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-accent">Finance</p>
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary">
            Family invoices and payments
          </h1>
          <p className="max-w-2xl text-sm leading-6 text-text-muted">
            Review what families owe, match confirmed receipts, and keep every
            financial action connected to its source record.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReadSettings ? (
            <Button asChild variant="secondary">
              <Link href="/finance/settings">Finance settings</Link>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void load()}
            disabled={isLoading}
          >
            {isLoading ? "Refreshing…" : "Refresh"}
          </Button>
        </div>
      </header>

      {summary?.accessMode === "SERVICING_ONLY" ? (
        <div className="rounded-xl border border-status-warning/30 bg-status-warning/5 p-4 text-sm text-text-primary">
          <p className="font-semibold">Finance is in servicing mode</p>
          <p className="mt-1 text-text-muted">
            You can review historic records, reconcile payments, and export
            scoped reports. New invoices and collection schedules are paused
            until Finance access is active.
          </p>
        </div>
      ) : null}

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-status-danger/25 bg-status-danger/5 p-4"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-text-primary">
                Finance needs your attention
              </p>
              <p className="mt-1 text-sm text-text-muted">{error}</p>
              <p className="mt-1 text-xs text-text-muted">
                Access is checked again on every request. If your role or
                Finance entitlement changed, refresh or ask an organisation
                administrator.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void load()}
              disabled={isLoading}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Finance sections"
        className="overflow-x-auto border-b border-border-subtle"
      >
        <div
          className="flex min-w-max gap-1"
          role="tablist"
          aria-label="Finance workspace"
          aria-orientation="horizontal"
        >
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              id={`finance-tab-${tab.id}`}
              aria-selected={activeTab === tab.id}
              aria-controls={`finance-panel-${tab.id}`}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
              className={`min-h-11 rounded-t-lg px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? "border-b-2 border-accent text-accent"
                  : "text-text-muted hover:bg-muted/50 hover:text-text-primary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <div>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            id={`finance-panel-${tab.id}`}
            aria-labelledby={`finance-tab-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            hidden={activeTab !== tab.id}
            className="outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
          >
            {activeTab === tab.id && tab.id === "overview" ? (
              <FinanceOverview
                summary={summary}
                invoices={invoices}
                receipts={receipts}
                isLoading={isLoading}
                onNavigate={setActiveTab}
              />
            ) : null}
            {activeTab === tab.id && tab.id === "invoices" ? (
              <FinanceInvoiceWorkspace
                invoices={invoices}
                payerAccounts={payerAccounts}
                hasMorePayerAccounts={payerAccountCursor !== null}
                isLoadingMorePayerAccounts={loadingMorePayerAccounts}
                onLoadMorePayerAccounts={loadMorePayerAccounts}
                currency={summary?.metadata.currency ?? null}
                canCreate={
                  canCreateInvoices && summary?.accessMode !== "SERVICING_ONLY"
                }
                canReview={
                  canReviewInvoices && summary?.accessMode !== "SERVICING_ONLY"
                }
                isLoading={isLoading}
                hasMore={invoiceCursor !== null}
                isLoadingMore={loadingMoreInvoices}
                onLoadMore={loadMoreInvoices}
                onRefresh={refreshInvoices}
              />
            ) : null}
            {activeTab === tab.id && tab.id === "payments" ? (
              <FinancePaymentWorkspace
                receipts={receipts}
                invoices={invoices}
                canAllocate={
                  canManageAllocations && summary?.accessMode !== undefined
                }
                canReverseAllocations={canManageAllocations}
                isLoading={isLoading}
                hasMoreInvoices={invoiceCursor !== null}
                isLoadingMoreInvoices={loadingMoreInvoices}
                hasMoreReceipts={receiptCursor !== null}
                isLoadingMoreReceipts={loadingMoreReceipts}
                onLoadMoreInvoices={loadMoreInvoices}
                onLoadMoreReceipts={loadMoreReceipts}
                onRefresh={refreshReceipts}
              />
            ) : null}
            {activeTab === tab.id && tab.id === "statements" ? (
              <FinanceStatementWorkspace
                statements={statements}
                payerAccounts={payerAccounts}
                hasMorePayerAccounts={payerAccountCursor !== null}
                isLoadingMorePayerAccounts={loadingMorePayerAccounts}
                onLoadMorePayerAccounts={loadMorePayerAccounts}
                isLoading={isLoading}
                hasMore={statementCursor !== null}
                isLoadingMore={loadingMoreStatements}
                onLoadMore={loadMoreStatements}
                onRefresh={load}
              />
            ) : null}
            {activeTab === tab.id && tab.id === "reports" ? (
              <FinanceReportWorkspace
                canExport={canExport}
                initialFilters={filters}
              />
            ) : null}
          </div>
        ))}
      </div>
    </main>
  );
}

function appendUnique<T extends { id: string }>(current: T[], next: T[]): T[] {
  const currentIds = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !currentIds.has(item.id))];
}
