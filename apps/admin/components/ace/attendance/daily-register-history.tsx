"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import { useSitePagedResults } from "@/components/ace/pace/use-site-paged-results";
import {
  fetchDailyAttendanceHistory,
  type DailyAttendanceCorrection,
} from "@/lib/daily-attendance-api";
import {
  dailyAbsenceLabel,
  dailyStatusLabel,
} from "./daily-attendance-display";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function markLabel(
  status: DailyAttendanceCorrection["newStatus"],
  reason: DailyAttendanceCorrection["newReason"],
): string {
  return reason
    ? `${dailyStatusLabel[status]} (${dailyAbsenceLabel[reason]})`
    : dailyStatusLabel[status];
}

export function DailyRegisterHistory({
  factId,
  childName,
  onClose,
}: {
  factId: string;
  childName: string;
  onClose: () => void;
}) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const fetchPage = React.useCallback(
    ({ cursor, signal }: { cursor?: string; signal?: AbortSignal }) =>
      fetchDailyAttendanceHistory(factId, { cursor, signal }),
    [factId],
  );
  const history = useSitePagedResults(
    fetchPage,
    true,
    "Unable to load correction history. Please retry.",
  );

  React.useEffect(() => headingRef.current?.focus(), [factId]);

  return (
    <section aria-labelledby="daily-history-heading" id="daily-history">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="font-heading text-xl font-semibold text-text-primary outline-none"
              id="daily-history-heading"
              ref={headingRef}
              tabIndex={-1}
            >
              Correction history · {childName}
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              Changes to this daily mark, newest first.
            </p>
          </div>
          <Button
            className="min-h-11"
            onClick={onClose}
            type="button"
            variant="secondary"
          >
            Close history
          </Button>
        </div>

        {history.isLoading ? (
          <p className="mt-5 text-sm text-text-muted" role="status">
            Loading corrections…
          </p>
        ) : history.error ? (
          <div className="mt-5 space-y-3">
            <p className="text-sm text-status-danger" role="alert">
              {history.error}
            </p>
            <Button onClick={history.retry} type="button" variant="secondary">
              Retry
            </Button>
          </div>
        ) : history.items.length === 0 ? (
          <p className="mt-5 rounded-xl border border-border-subtle bg-surface px-4 py-5 text-sm text-text-muted">
            No corrections have been recorded for this mark.
          </p>
        ) : (
          <ol
            className="mt-5 space-y-3"
            aria-label={`Corrections for ${childName}`}
          >
            {history.items.map((item, index) => (
              <li
                className="rounded-xl border border-border-subtle bg-surface p-4"
                key={`${item.correctedAt}-${index}`}
              >
                <p className="font-semibold text-text-primary">
                  {markLabel(item.previousStatus, item.previousReason)} →{" "}
                  {markLabel(item.newStatus, item.newReason)}
                </p>
                <p className="mt-2 text-sm text-text-primary">
                  {item.correctionReason}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  <time dateTime={item.correctedAt}>
                    {dateFormatter.format(new Date(item.correctedAt))}
                  </time>{" "}
                  · {item.correctedBy}
                </p>
              </li>
            ))}
          </ol>
        )}

        {history.nextCursor && !history.isLoading && !history.error ? (
          <div className="mt-4 space-y-2">
            {history.loadMoreError ? (
              <p className="text-sm text-status-danger" role="alert">
                {history.loadMoreError}
              </p>
            ) : null}
            <Button
              className="min-h-11"
              disabled={history.isLoadingMore}
              onClick={history.loadMore}
              type="button"
              variant="secondary"
            >
              {history.isLoadingMore ? "Loading…" : "Load more corrections"}
            </Button>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
