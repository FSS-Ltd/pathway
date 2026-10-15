"use client";
import React from "react";
import { Button } from "@pathway/ui";
import type {
  CompliancePersonnelRecord,
  ComplianceRecordKind,
  ComplianceRecordPage,
} from "@pathway/types";
import { COMPLIANCE_RECORD_KINDS } from "@pathway/types";
import { complianceClient } from "@/lib/compliance-client";
import { KIND_LABELS, fieldClass } from "./record-fields";
import { RecordEditor } from "./record-editor";
export function ChecksRegister({ canManage }: { canManage: boolean }) {
  const [page, setPage] = React.useState<ComplianceRecordPage | null>(null);
  const [kind, setKind] = React.useState<ComplianceRecordKind | undefined>();
  const [includeArchived, setIncludeArchived] = React.useState(false);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState(false);
  const [selected, setSelected] = React.useState<
    CompliancePersonnelRecord | null | undefined
  >();
  const controller = React.useRef<AbortController | null>(null);
  const trigger = React.useRef<HTMLButtonElement | null>(null);
  React.useEffect(() => {
    if (selected === undefined) trigger.current?.focus();
  }, [selected]);
  const load = React.useCallback(
    async (cursor?: string) => {
      controller.current?.abort();
      const current = new AbortController();
      controller.current = current;
      setBusy(true);
      setError(false);
      try {
        const result = await complianceClient.list(current.signal, {
          kind,
          includeArchived,
          cursor,
        });
        if (!current.signal.aborted)
          setPage((previous) => ({
            ...result,
            items: cursor
              ? [...(previous?.items ?? []), ...result.items]
              : result.items,
          }));
      } catch {
        if (!current.signal.aborted) setError(true);
      } finally {
        if (!current.signal.aborted) setBusy(false);
      }
    },
    [kind, includeArchived],
  );
  React.useEffect(() => {
    setPage(null);
    void load();
    return () => controller.current?.abort();
  }, [load]);
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-2xl font-semibold text-text-primary">
            Checks &amp; Training
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            Role-relevant personnel records for this site. Review dates and
            verification support your work; they do not certify legal
            compliance.
          </p>
        </div>
        {canManage && (
          <Button
            className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
            disabled={selected !== undefined}
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setSelected(null);
            }}
          >
            Add record
          </Button>
        )}
      </header>
      {page && (
        <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-border-subtle bg-surface p-4 sm:grid-cols-3">
          {(
            [
              ["Active records", page.summary.active],
              ["Overdue reviews", page.summary.overdueReview],
              ["Awaiting verification", page.summary.awaitingVerification],
            ] as const
          ).map(([label, total]) => (
            <div key={label}>
              <dt className="text-sm text-text-muted">{label}</dt>
              <dd className="text-2xl font-semibold tabular-nums">{total}</dd>
            </div>
          ))}
        </dl>
      )}
      {selected !== undefined && (
        <RecordEditor
          key={selected?.id ?? "new"}
          initial={selected}
          canManage={canManage}
          onSaved={() => void load()}
          onClose={() => {
            setSelected(undefined);
            trigger.current?.focus();
          }}
        />
      )}
      <section aria-label="Personnel register" className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-medium">
            Filter by type
            <select
              className={fieldClass}
              value={kind ?? ""}
              onChange={(event) =>
                setKind(
                  COMPLIANCE_RECORD_KINDS.find(
                    (item) => item === event.target.value,
                  ),
                )
              }
            >
              <option value="">All record types</option>
              {COMPLIANCE_RECORD_KINDS.map((item) => (
                <option key={item} value={item}>
                  {KIND_LABELS[item]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
            />
            Include archived records
          </label>
        </div>
        {busy && <p role="status">Loading records…</p>}
        {error && (
          <div role="alert" className="space-y-2">
            <p>
              The register could not be loaded. Existing displayed records may
              be out of date.
            </p>
            <Button
              className="min-h-11 h-auto whitespace-normal py-2"
              variant="secondary"
              onClick={() => void load()}
            >
              Retry register
            </Button>
          </div>
        )}
        {page && !busy && !error && page.items.length === 0 && (
          <p className="rounded-xl border border-border-subtle p-5 text-sm text-text-muted">
            No records match this view. An empty register does not mean there
            are no applicable obligations.
          </p>
        )}
        {page && (
          <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
            {page.items.map((record) => (
              <li key={record.id}>
                <button
                  disabled={selected !== undefined}
                  onClick={(event) => {
                    trigger.current = event.currentTarget;
                    setSelected(record);
                  }}
                  className="flex min-h-16 w-full flex-col items-start justify-between sm:flex-row gap-3 p-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-60"
                >
                  <div className="min-w-0 flex-1">
                    <span className="block break-words font-semibold">
                      {record.subjectName}
                    </span>
                    <span className="block break-words text-sm text-text-muted">
                      {record.title} · {KIND_LABELS[record.kind]}
                    </span>
                    <span className="block text-sm text-text-muted">
                      {record.roleDescription}
                    </span>
                  </div>
                  <div className="text-sm">
                    <span className="block">
                      {record.archivedAt
                        ? "Archived"
                        : record.status[0] +
                          record.status.slice(1).toLowerCase()}
                    </span>
                    <span className="text-text-muted">
                      Review: {record.reviewDueOn ?? "Not set"}
                    </span>
                  </div>
                  <span className="text-sm font-medium text-text-primary">
                    View details
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {page?.nextCursor && (
          <Button
            className="min-h-11 h-auto whitespace-normal py-2"
            variant="secondary"
            disabled={busy}
            onClick={() => void load(page.nextCursor ?? undefined)}
          >
            Load more records
          </Button>
        )}
      </section>
    </div>
  );
}
