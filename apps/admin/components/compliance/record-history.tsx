"use client";
import React from "react";
import { Button } from "@pathway/ui";
import type { ComplianceRevisionPage } from "@pathway/types";
import { complianceClient } from "@/lib/compliance-client";
export function RecordHistory({
  id,
  version,
}: {
  id: string;
  version: number;
}) {
  const [page, setPage] = React.useState<ComplianceRevisionPage | null>(null);
  const [error, setError] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const controller = React.useRef<AbortController | null>(null);
  React.useEffect(() => {
    setPage(null);
    setBusy(false);
    setError(false);
    return () => controller.current?.abort();
  }, [id, version]);
  async function load(cursor?: string) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError(false);
    try {
      const result = await complianceClient.history(id, current.signal, cursor);
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
  }
  return (
    <section
      aria-label="Record history"
      className="space-y-3 border-t border-border-subtle pt-4"
    >
      <h3 className="font-semibold">Record history</h3>
      {!page && (
        <Button
          className="min-h-11 h-auto whitespace-normal py-2"
          variant="secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          {busy ? "Loading history…" : "Load history"}
        </Button>
      )}
      {error && (
        <p role="alert">
          History could not be loaded.{" "}
          <Button
            className="min-h-11 h-auto whitespace-normal py-2"
            variant="secondary"
            onClick={() => void load(page?.nextCursor ?? undefined)}
          >
            Retry history
          </Button>
        </p>
      )}
      {page && (
        <ol className="space-y-2">
          {page.items.map((item) => (
            <li key={item.id}>
              <details className="rounded-lg border border-border-subtle p-3">
                <summary className="cursor-pointer text-sm">
                  Version {item.version} ·{" "}
                  {new Date(item.createdAt).toLocaleString()} ·{" "}
                  {item.snapshot.status.toLowerCase()}
                </summary>
                <dl className="mt-3 grid gap-2 break-words text-sm">
                  <dt>Person / role</dt>
                  <dd>
                    {item.snapshot.subjectName} ·{" "}
                    {item.snapshot.roleDescription}
                  </dd>
                  <dt>Type / scheme / provider</dt>
                  <dd>
                    {item.snapshot.kind} /{" "}
                    {item.snapshot.scheme ?? "Not applicable"} /{" "}
                    {item.snapshot.provider ?? "Not recorded"}
                  </dd>
                  <dt>Linked portal account</dt>
                  <dd>{item.snapshot.subjectUserId ?? "Not linked"}</dd>
                  <dt>Title / reference</dt>
                  <dd>
                    {item.snapshot.title} ·{" "}
                    {item.snapshot.reference ?? "Not recorded"}
                  </dd>
                  <dt>Issue or completion / review</dt>
                  <dd>
                    {item.snapshot.completedOn ?? "Not recorded"} /{" "}
                    {item.snapshot.reviewDueOn ?? "Not set"}
                  </dd>
                  <dt>Verification</dt>
                  <dd className="whitespace-pre-wrap">
                    {item.snapshot.verificationNotes ?? "Not recorded"}
                  </dd>
                  <dt>Notes</dt>
                  <dd className="whitespace-pre-wrap">
                    {item.snapshot.notes ?? "Not recorded"}
                  </dd>
                  <dt>Verified at / by</dt>
                  <dd>
                    {item.snapshot.verifiedAt ?? "Not verified"} /{" "}
                    {item.snapshot.verifiedByUserId ?? "Not verified"}
                  </dd>
                  <dt>Recorded by</dt>
                  <dd>{item.actorUserId}</dd>
                  {item.snapshot.archivedAt && <dd>Archived</dd>}
                </dl>
              </details>
            </li>
          ))}
        </ol>
      )}
      {page?.nextCursor && (
        <Button
          className="min-h-11 h-auto whitespace-normal py-2"
          variant="secondary"
          disabled={busy}
          onClick={() => void load(page.nextCursor ?? undefined)}
        >
          Load older versions
        </Button>
      )}
    </section>
  );
}
