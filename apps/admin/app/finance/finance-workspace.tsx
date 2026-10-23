"use client";

import Link from "next/link";
import React from "react";
import { Card } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
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
import { FinanceOperationsWorkspace } from "./operations-workspace";
import { FinanceReportWorkspace } from "./report-workspace";

type FinanceTab =
  | "overview"
  | "invoices"
  | "payments"
  | "statements"
  | "reports"
  | "operations";

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
  const [accessDenied, setAccessDenied] = React.useState(false);
  const readGeneration = React.useRef(0);
  const denyAccess = React.useCallback(() => {
    readGeneration.current += 1;
    setSummary(null);
    setInvoices([]);
    setReceipts([]);
    setPayerAccounts([]);
    setStatements([]);
    setInvoiceCursor(null);
    setReceiptCursor(null);
    setStatementCursor(null);
    setPayerAccountCursor(null);
    setAccessDenied(true);
    setIsLoading(false);
  }, []);
  const filters = React.useMemo(currentFinanceFilters, []);

  const load = React.useCallback(async () => {
    const generation = ++readGeneration.current;
    setAccessDenied(false);
    setIsLoading(true);
    setError(null);
    setFinanceLocked(false);
    let summaryLoaded = false;
    try {
      const nextSummary = await fetchFinanceReportSummary(filters);
      if (generation !== readGeneration.current) return;
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
      if (generation !== readGeneration.current) return;
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
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        denyAccess();
      }
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
      if (generation === readGeneration.current) setIsLoading(false);
    }
  }, [canReadStatements, denyAccess, filters, showUpgradeIfLocked]);

  React.useEffect(() => {
    void load();
    return () => {
      readGeneration.current += 1;
    };
  }, [load]);

  const refreshInvoices = React.useCallback(async () => {
    const generation = readGeneration.current;
    try {
      const [invoicePage, payerPage] = await Promise.all([
        fetchFinanceInvoices(),
        fetchFinancePayerAccounts(),
      ]);
      if (generation !== readGeneration.current) return;
      setInvoices(invoicePage.items);
      setInvoiceCursor(invoicePage.nextCursor);
      setPayerAccounts(payerPage.items);
      setPayerAccountCursor(payerPage.nextCursor);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      )
        denyAccess();
      throw caught;
    }
  }, [denyAccess]);

  const refreshReceipts = React.useCallback(async () => {
    const generation = readGeneration.current;
    try {
      const [receiptPage, invoicePage] = await Promise.all([
        fetchFinanceReceipts(),
        fetchFinanceInvoices(),
      ]);
      if (generation !== readGeneration.current) return;
      setReceipts(receiptPage.items);
      setReceiptCursor(receiptPage.nextCursor);
      setInvoices(invoicePage.items);
      setInvoiceCursor(invoicePage.nextCursor);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      )
        denyAccess();
      throw caught;
    }
  }, [denyAccess]);

  const loadMoreInvoices = React.useCallback(async () => {
    if (!invoiceCursor || loadingMoreInvoices) return;
    setLoadingMoreInvoices(true);
    const generation = readGeneration.current;
    try {
      const page = await fetchFinanceInvoices(invoiceCursor);
      if (generation !== readGeneration.current) return;
      setInvoices((current) => appendUnique(current, page.items));
      setInvoiceCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        denyAccess();
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Invoices could not be loaded.",
      );
    } finally {
      setLoadingMoreInvoices(false);
    }
  }, [denyAccess, invoiceCursor, loadingMoreInvoices]);

  const loadMoreReceipts = React.useCallback(async () => {
    if (!receiptCursor || loadingMoreReceipts) return;
    setLoadingMoreReceipts(true);
    const generation = readGeneration.current;
    try {
      const page = await fetchFinanceReceipts(receiptCursor);
      if (generation !== readGeneration.current) return;
      setReceipts((current) => appendUnique(current, page.items));
      setReceiptCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        denyAccess();
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Payments could not be loaded.",
      );
    } finally {
      setLoadingMoreReceipts(false);
    }
  }, [denyAccess, loadingMoreReceipts, receiptCursor]);

  const loadMoreStatements = React.useCallback(async () => {
    if (!statementCursor || loadingMoreStatements) return;
    setLoadingMoreStatements(true);
    const generation = readGeneration.current;
    try {
      const page = await fetchFinanceStatements(statementCursor);
      if (generation !== readGeneration.current) return;
      setStatements((current) => appendUnique(current, page.items));
      setStatementCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        denyAccess();
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Statements could not be loaded.",
      );
    } finally {
      setLoadingMoreStatements(false);
    }
  }, [denyAccess, loadingMoreStatements, statementCursor]);

  const loadMorePayerAccounts = React.useCallback(async () => {
    if (!payerAccountCursor || loadingMorePayerAccounts) return;
    setLoadingMorePayerAccounts(true);
    const generation = readGeneration.current;
    try {
      const page = await fetchFinancePayerAccounts(payerAccountCursor);
      if (generation !== readGeneration.current) return;
      setPayerAccounts((current) => appendUnique(current, page.items));
      setPayerAccountCursor(page.nextCursor);
    } catch (caught) {
      if (generation !== readGeneration.current) return;
      if (
        caught instanceof ApiError &&
        (caught.status === 401 || caught.status === 403)
      ) {
        denyAccess();
        return;
      }
      setError(
        caught instanceof Error
          ? caught.message
          : "Payer accounts could not be loaded.",
      );
    } finally {
      setLoadingMorePayerAccounts(false);
    }
  }, [denyAccess, loadingMorePayerAccounts, payerAccountCursor]);

  const tabs: Array<{ id: FinanceTab; label: string }> = [
    { id: "overview", label: "Overview" },
    { id: "invoices", label: "Invoices" },
    { id: "payments", label: "Payments & review" },
    ...(canReadStatements
      ? [{ id: "statements" as const, label: "Statements" }]
      : []),
    { id: "reports", label: "Reports" },
    { id: "operations", label: "Operations" },
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

  if (accessDenied && !financeLocked) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Finance access changed
        </h1>
        <p role="alert" className="text-sm text-text-muted">
          Financial records have been cleared. Ask an organisation administrator
          to check your access.
        </p>
        <Button variant="secondary" onClick={() => void load()}>
          Check access again
        </Button>
      </main>
    );
  }

  if (financeLocked) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-5 p-4 sm:p-6">
        <header className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">Finance</p>
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
          <p className="text-sm font-semibold text-text-primary">Finance</p>
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
        <div className="rounded-xl border border-status-warn/30 bg-status-warn/5 p-4 text-sm text-text-primary">
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
              className={`min-h-11 rounded-t-lg px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2 ${
                activeTab === tab.id
                  ? "border-b-2 border-accent text-text-primary"
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
            className="outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2"
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
                onAccessDenied={denyAccess}
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
            {activeTab === tab.id && tab.id === "operations" ? (
              <FinanceOperationsWorkspace canManage={canManageAllocations} />
            ) : null}
            {activeTab === tab.id && tab.id === "reports" ? (
              <FinanceReportWorkspace
                canExport={canExport}
                initialFilters={filters}
                onAccessDenied={denyAccess}
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
