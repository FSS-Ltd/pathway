"use client";
import React from "react";
import { Card } from "@pathway/ui";
import { FinanceButton as Button } from "./finance-button";
import { ApiError } from "@/lib/api-transport";
import {
  fetchFinanceCaseHistory,
  requestFinanceCaseAction,
  type FinanceCaseDetail,
} from "@/lib/finance-reconciliation-client";
import { formatFinanceDateTime } from "./finance-format";

export function OperationsCaseDetail({
  detail,
  canManage,
  onRefresh,
  onPermissionRevoked,
}: {
  detail: FinanceCaseDetail;
  canManage: boolean;
  onRefresh: () => Promise<void>;
  onPermissionRevoked: () => void;
}) {
  const mounted = React.useRef(true);
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [history, setHistory] = React.useState(detail.events);
  const [historyCursor, setHistoryCursor] = React.useState(
    detail.nextEventCursor,
  );
  const [loadingHistory, setLoadingHistory] = React.useState(false);
  React.useEffect(() => {
    setHistory(detail.events);
    setHistoryCursor(detail.nextEventCursor);
  }, [detail]);
  const loadHistory = async () => {
    if (!historyCursor || loadingHistory) return;
    setLoadingHistory(true);
    try {
      const page = await fetchFinanceCaseHistory(detail.id, historyCursor);
      setHistory((current) => [...current, ...page.events]);
      setHistoryCursor(page.nextEventCursor);
    } catch (error) {
      if (error instanceof ApiError && error.status === 403)
        onPermissionRevoked();
      setMessage(
        error instanceof Error ? error.message : "History could not be loaded.",
      );
    } finally {
      setLoadingHistory(false);
    }
  };
  const [action, setAction] = React.useState<
    "acknowledge" | "recheck" | "replay" | null
  >(null);
  const [reason, setReason] = React.useState("");
  const [evidenceId, setEvidenceId] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [revoked, setRevoked] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const requestId = React.useRef(crypto.randomUUID());
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!action || pending) return;
    setPending(true);
    setMessage(null);
    try {
      await requestFinanceCaseAction(detail.id, action, {
        requestId: requestId.current,
        reason,
        expectedLastSeenAt: detail.lastSeenAt,
        ...(action === "replay" ? { evidenceId } : {}),
      });
      if (!mounted.current) return;
      setMessage(
        action === "acknowledge"
          ? "Acknowledged. This case remains unresolved."
          : "Request stored. Recovery workers will inspect the evidence; this does not confirm a financial correction.",
      );
      setAction(null);
      requestId.current = crypto.randomUUID();
      await onRefresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) {
        setRevoked(true);
        onPermissionRevoked();
      }
      setMessage(
        error instanceof ApiError && error.status === 409
          ? "Evidence changed. Refresh this case and review it again."
          : error instanceof Error
            ? error.message
            : "Action unavailable. Refresh and try again.",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="space-y-5">
      <Card
        title="Case context"
        description={`${detail.connection.legalEntityName} · ${detail.connection.mode} · ${detail.connection.status}`}
      >
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">Provider account</dt>
            <dd className="break-all">
              {detail.connection.accountId ?? "Unavailable"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Resource</dt>
            <dd className="break-all">
              {detail.resourceReference ?? "Connection coverage"}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">Last observed</dt>
            <dd>{formatFinanceDateTime(detail.lastSeenAt)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">Case status</dt>
            <dd>{detail.status}</dd>
          </div>
        </dl>
        <p className="mt-4 text-sm text-text-muted">
          Acknowledgement records review. Only verified evidence can resolve a
          case. Financial corrections require their existing approval flow.
        </p>
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer font-semibold">
            Detection evidence
          </summary>
          <pre className="mt-2 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-3 text-xs">
            {JSON.stringify(detail.details, null, 2)}
          </pre>
        </details>
      </Card>
      <Card
        title="Coverage and freshness"
        description="A successful stream does not prove coverage for another stream."
      >
        {detail.coverage.length ? (
          <ul className="divide-y divide-border-subtle">
            {detail.coverage.map((state) => (
              <li key={state.stream} className="py-3 text-sm">
                <p className="font-semibold">{state.stream}</p>
                <p className="text-text-muted">
                  Covered through{" "}
                  {state.completedThrough
                    ? formatFinanceDateTime(state.completedThrough)
                    : "not yet established"}{" "}
                  · Last success{" "}
                  {state.lastSucceededAt
                    ? formatFinanceDateTime(state.lastSucceededAt)
                    : "none"}
                </p>
                {state.lastError ? (
                  <p className="text-text-primary">{state.lastError}</p>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted">
            Coverage has not been established for this connection.
          </p>
        )}
      </Card>
      <Card
        title="Safe review actions"
        description="Requests use this connection and environment. No action creates a payment, refund or mandate."
      >
        {message ? (
          <p role="status" className="mb-4 text-sm">
            {message}
          </p>
        ) : null}
        {revoked ? (
          <p role="alert">
            Your Finance permission changed. Refresh access before continuing.
          </p>
        ) : canManage && detail.status !== "RESOLVED" ? (
          <>
            <div className="flex flex-wrap gap-2">
              {(["acknowledge", "recheck", "replay"] as const).map((value) => (
                <Button
                  key={value}
                  variant="secondary"
                  disabled={pending}
                  onClick={() => {
                    setAction(value);
                    setReason("");
                    requestId.current = crypto.randomUUID();
                  }}
                >
                  {value === "acknowledge"
                    ? "Acknowledge"
                    : value === "recheck"
                      ? "Request recheck"
                      : "Request evidence replay"}
                </Button>
              ))}
            </div>
            {action ? (
              <form
                onSubmit={(event) => void submit(event)}
                className="mt-4 space-y-3 rounded-xl border border-border-subtle p-4"
              >
                <p className="font-semibold">Confirm {action}</p>
                <p className="text-sm text-text-muted">
                  {action === "acknowledge"
                    ? "This records your review and leaves the case unresolved."
                    : "A worker will inspect existing evidence. Review the account and environment above before confirming."}
                </p>
                {action === "replay" ? (
                  <label className="block text-sm">
                    Stored connection evidence
                    <select
                      required
                      value={evidenceId}
                      onChange={(event) => setEvidenceId(event.target.value)}
                      className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface p-2"
                    >
                      <option value="">Select evidence</option>
                      {detail.evidence.map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.eventType} · {item.status} ·{" "}
                          {item.stripeEventId}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="block text-sm">
                  Review reason
                  <textarea
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    disabled={pending}
                    onChange={(event) => setReason(event.target.value)}
                    className="mt-1 block w-full rounded-lg border border-border-subtle bg-surface p-2"
                  />
                </label>
                <div className="flex gap-2">
                  <Button
                    type="submit"
                    disabled={
                      pending ||
                      reason.trim().length < 3 ||
                      (action === "replay" && !evidenceId)
                    }
                  >
                    {pending ? "Submitting…" : "Confirm request"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={() => setAction(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-text-muted">
            {detail.status === "RESOLVED"
              ? "Resolved cases retain their history."
              : "Your role allows inspection only."}
          </p>
        )}
      </Card>
      <Card
        title="Append-only history"
        description="Newest events first. Earlier events remain available."
      >
        <ol className="space-y-4">
          {history.map((event) => (
            <li
              key={event.id}
              className="border-l-2 border-border-subtle pl-4 text-sm"
            >
              <p className="font-semibold">{event.type}</p>
              <p className="text-text-muted">
                {formatFinanceDateTime(event.createdAt)} ·{" "}
                {event.actorUserId ? "Staff review" : "Recovery worker"}
              </p>
              <details>
                <summary className="cursor-pointer">Event details</summary>
                <pre className="overflow-auto whitespace-pre-wrap break-all text-xs">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              </details>
            </li>
          ))}
        </ol>
        {historyCursor ? (
          <Button
            variant="secondary"
            disabled={loadingHistory}
            onClick={() => void loadHistory()}
          >
            {loadingHistory ? "Loading history…" : "Load earlier events"}
          </Button>
        ) : null}
      </Card>
    </div>
  );
}
