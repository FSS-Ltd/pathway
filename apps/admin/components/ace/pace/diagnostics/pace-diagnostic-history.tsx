import React from "react";
import { Badge, Button, Card } from "@pathway/ui";
import type { PagedSiteResults } from "@/components/ace/pace/use-site-paged-results";
import type { PaceDiagnosticResult } from "@/lib/pace-diagnostic-api";

type Props = {
  history: PagedSiteResults<PaceDiagnosticResult>;
  includeRetracted: boolean;
  onIncludeRetractedChange: (value: boolean) => void;
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function PaceDiagnosticHistory({
  history,
  includeRetracted,
  onIncludeRetractedChange,
}: Props) {
  return (
    <Card
      title="Results"
      description="The original result remains in the audit history if it is retracted."
      actions={
        <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm font-medium text-text-primary">
          <input
            type="checkbox"
            checked={includeRetracted}
            onChange={(event) =>
              onIncludeRetractedChange(event.currentTarget.checked)
            }
            className="h-4 w-4 accent-accent-strong"
          />
          Include retracted
        </label>
      }
    >
      {history.isLoading ? (
        <div
          role="status"
          className="space-y-3"
          aria-label="Loading diagnostic results"
        >
          <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          <div className="h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        </div>
      ) : history.error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-status-danger">{history.error}</p>
          <Button type="button" variant="secondary" onClick={history.retry}>
            Retry
          </Button>
        </div>
      ) : history.items.length === 0 ? (
        <p className="text-sm leading-6 text-text-muted">
          {includeRetracted
            ? "No diagnostic results have been recorded for this child and subject."
            : "No active diagnostic results have been recorded for this child and subject."}
        </p>
      ) : (
        <ul aria-label="Diagnostic results" className="space-y-3">
          {history.items.map((result) => (
            <li
              key={result.id}
              className="rounded-xl border border-border-subtle p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">
                    Level {result.level} ·{" "}
                    {result.outcome === "PASS" ? "Pass" : "Fail"}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    Recorded {dateFormatter.format(new Date(result.recordedAt))}{" "}
                    by {result.recordedBy.displayName}
                  </p>
                </div>
                <Badge
                  variant={
                    result.retraction
                      ? "secondary"
                      : result.outcome === "PASS"
                        ? "success"
                        : "warning"
                  }
                >
                  {result.retraction
                    ? "Retracted"
                    : result.outcome === "PASS"
                      ? "Pass"
                      : "Fail"}
                </Badge>
              </div>
              {result.retraction ? (
                <p className="mt-3 rounded-lg bg-muted p-3 text-sm leading-6 text-text-muted">
                  Retracted{" "}
                  {dateFormatter.format(
                    new Date(result.retraction.retractedAt),
                  )}{" "}
                  by {result.retraction.retractedBy.displayName}. Reason:{" "}
                  {result.retraction.reason}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {history.nextCursor && !history.isLoading && !history.error ? (
        <div className="mt-4 space-y-2">
          {history.loadMoreError ? (
            <p role="alert" className="text-sm text-status-danger">
              {history.loadMoreError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            disabled={history.isLoadingMore}
            onClick={history.loadMore}
          >
            {history.isLoadingMore ? "Loading…" : "Load more results"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
