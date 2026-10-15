"use client";
import React from "react";
import Link from "next/link";
import { Button } from "@pathway/ui";
import type { ComplianceMedicalPage } from "@pathway/types";
import { complianceMedicalClient } from "@/lib/compliance-medical-client";
import { hasUnavailableMedical } from "@/lib/medical-read";
import { MedicalSummary } from "./medical-fields";
export function MedicalRegister({ canManage }: { canManage: boolean }) {
  const [page, setPage] = React.useState<ComplianceMedicalPage | null>(null);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  const load = React.useCallback(async (cursor?: string) => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(false);
    try {
      const result = await complianceMedicalClient.list(current.signal, cursor);
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
  }, []);
  React.useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);
  return (
    <div className="space-y-6">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-semibold text-text-primary">
          Medical Information
        </h1>
        <p className="mt-2 text-sm text-text-muted">
          Health information recorded for children at this site. Unknown
          information needs confirmation; it does not mean there are no needs.
        </p>
      </header>
      {busy && <p role="status">Loading medical information…</p>}
      {error && (
        <div role="alert" className="space-y-2">
          <p>
            Medical information could not be loaded. Displayed records may be
            out of date.
          </p>
          <Button
            className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
            onClick={() => void load()}
          >
            Retry medical information
          </Button>
        </div>
      )}
      {page?.items.some(hasUnavailableMedical) && (
        <div role="alert" className="space-y-3">
          <p>
            Some medical information could not be read. Do not treat it as no
            medical needs. Retry; if it remains unavailable, ask an
            administrator to restore access.
          </p>
          <Button
            className="min-h-11 h-auto whitespace-normal py-2 text-text-primary"
            disabled={busy}
            onClick={() => void load()}
          >
            Retry unavailable information
          </Button>
        </div>
      )}
      {page && !busy && !error && page.items.length === 0 && (
        <p>No children are available in this site’s medical register.</p>
      )}
      {page && (
        <ul className="divide-y divide-border-subtle rounded-xl border border-border-subtle bg-surface">
          {page.items.map((record) => (
            <li key={record.id} className="space-y-4 p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="break-words font-semibold">
                    {record.firstName} {record.lastName}
                    {record.preferredName &&
                    record.preferredName !== record.firstName
                      ? ` (${record.preferredName})`
                      : ""}
                  </h2>
                  <p className="text-sm text-text-muted">
                    {record.yearGroup
                      ? `Year group: ${record.yearGroup}`
                      : "Year group not recorded"}
                  </p>
                </div>
                {canManage && (
                  <Link
                    className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong"
                    href={`/children/${encodeURIComponent(record.id)}/edit?section=medical`}
                    aria-label={`Edit medical information for ${record.firstName} ${record.lastName}`}
                  >
                    Edit medical information
                  </Link>
                )}
              </div>
              <MedicalSummary value={record} />
            </li>
          ))}
        </ul>
      )}
      {page?.nextCursor && (
        <Button
          className="min-h-11 h-auto whitespace-normal py-2"
          disabled={busy}
          variant="secondary"
          onClick={() => void load(page.nextCursor ?? undefined)}
        >
          Load more children
        </Button>
      )}
    </div>
  );
}
