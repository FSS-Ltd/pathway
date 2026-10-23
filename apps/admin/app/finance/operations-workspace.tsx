"use client";
import React from "react";
import { Button, Card } from "@pathway/ui";
import { FINANCE_CURRENCIES } from "@pathway/platform/finance-currencies";
import { ApiError } from "@/lib/api-transport";
import {
  fetchFinanceCase,
  fetchFinanceCases,
  type FinanceCase,
  type FinanceCaseDetail,
} from "@/lib/finance-reconciliation-client";
import { formatFinanceMoney } from "./finance-format";
import { OperationsCaseDetail } from "./operations-case-detail";

export function FinanceOperationsWorkspace({
  canManage,
}: {
  canManage: boolean;
}) {
  const [items, setItems] = React.useState<FinanceCase[]>([]);
  const [selected, setSelected] = React.useState<FinanceCaseDetail | null>(
    null,
  );
  const [status, setStatus] = React.useState("OPEN");
  const [currency, setCurrency] = React.useState("");
  const [cursor, setCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revoked, setRevoked] = React.useState(false);
  const generation = React.useRef(0);
  const reportError = (caught: unknown) => {
    if (caught instanceof ApiError && caught.status === 403) {
      setRevoked(true);
      setSelected(null);
      setItems([]);
    }
    setError(
      caught instanceof Error
        ? caught.message
        : "Operations could not be loaded.",
    );
  };
  const load = React.useCallback(
    async (next?: string | null) => {
      const current = ++generation.current;
      setLoading(true);
      setError(null);
      try {
        const page = await fetchFinanceCases(status, currency, next);
        if (current !== generation.current) return;
        setItems((current) =>
          next ? [...current, ...page.items] : page.items,
        );
        setCursor(page.nextCursor);
        setRevoked(false);
      } catch (caught) {
        if (current === generation.current) reportError(caught);
      } finally {
        if (current === generation.current) setLoading(false);
      }
    },
    [status, currency],
  );
  React.useEffect(() => {
    setSelected(null);
    void load();
  }, [load]);
  const open = async (id: string) => {
    const current = ++generation.current;
    setLoading(true);
    setError(null);
    try {
      const detail = await fetchFinanceCase(id);
      if (current === generation.current) setSelected(detail);
    } catch (caught) {
      if (current === generation.current) reportError(caught);
    } finally {
      if (current === generation.current) setLoading(false);
    }
  };
  return (
    <section aria-label="Finance operations" className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold">
            Operations and recovery
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-text-muted">
            Review exceptions, coverage and stored evidence. Acknowledgement
            does not resolve an exception or confirm money.
          </p>
        </div>
        <Button
          variant="secondary"
          disabled={loading}
          onClick={() => void load()}
        >
          Refresh cases
        </Button>
      </header>
      <div className="flex flex-wrap gap-4">
        <label className="text-sm">
          Case status
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className="ml-2 rounded-lg border border-border-subtle bg-surface p-2"
          >
            <option value="">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="ACKNOWLEDGED">Acknowledged</option>
            <option value="RESOLVED">Resolved</option>
          </select>
        </label>
        <label className="text-sm">
          Currency
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="ml-2 rounded-lg border border-border-subtle bg-surface p-2"
          >
            <option value="">All currencies</option>
            {FINANCE_CURRENCIES.map((value) => (
              <option value={value} key={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-status-danger/30 p-4 text-sm"
        >
          {revoked
            ? "Finance access changed. Refresh or contact your organisation administrator."
            : error}
        </div>
      ) : null}
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading operations…
        </p>
      ) : null}
      {!loading && !error && !items.length ? (
        <Card
          title="No matching cases"
          description="No exceptions match these filters. Review connection coverage before assuming reconciliation is complete."
        />
      ) : null}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(16rem,1fr)_minmax(0,2fr)]">
        <div className="space-y-2">
          {items.map((item) => (
            <button
              type="button"
              key={item.id}
              onClick={() => void open(item.id)}
              disabled={loading}
              aria-pressed={selected?.id === item.id}
              className={`w-full rounded-xl border p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${selected?.id === item.id ? "border-accent-primary bg-accent-subtle" : "border-border-subtle bg-surface"}`}
            >
              <span className="block font-semibold">
                {item.kind.replaceAll("_", " ")}
              </span>
              <span className="mt-1 block text-sm text-text-muted">
                {item.status} · {item.connection.mode} ·{" "}
                {item.connection.legalEntityName}
              </span>
              <span className="mt-2 block text-sm">
                {item.amountMinor && item.currency
                  ? formatFinanceMoney(item.amountMinor, item.currency)
                  : "No principal amount"}
              </span>
            </button>
          ))}
          {cursor ? (
            <Button
              variant="secondary"
              disabled={loading}
              onClick={() => void load(cursor)}
            >
              Load more cases
            </Button>
          ) : null}
        </div>
        <div>
          {selected ? (
            <OperationsCaseDetail
              key={selected.id}
              detail={selected}
              canManage={canManage}
              onRefresh={() => open(selected.id)}
              onPermissionRevoked={() => {
                setRevoked(true);
                setSelected(null);
                setItems([]);
                setError("Finance permission changed.");
              }}
            />
          ) : items.length ? (
            <Card
              title="Choose a case"
              description="Inspect its legal entity, account, environment and coverage before requesting a safe action."
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
