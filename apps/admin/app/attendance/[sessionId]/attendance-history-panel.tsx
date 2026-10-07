"use client";

import React from "react";
import { Badge, Button, Card } from "@pathway/ui";
import { useSitePagedResults } from "@/components/ace/pace/use-site-paged-results";
import {
  fetchAttendanceHistory,
  type AttendanceCorrection,
} from "../../../lib/attendance-history-api";

const statusLabel: Record<
  NonNullable<AttendanceCorrection["previousStatus"]>,
  string
> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
};

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function AttendanceHistoryPanel({
  attendanceId,
  childName,
  onClose,
}: {
  attendanceId: string;
  childName: string;
  onClose: () => void;
}) {
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const fetchPage = React.useCallback(
    ({ cursor, signal }: { cursor?: string; signal?: AbortSignal }) =>
      fetchAttendanceHistory(attendanceId, { cursor, signal }),
    [attendanceId],
  );
  const history = useSitePagedResults(
    fetchPage,
    true,
    "Unable to load correction history. Please retry.",
  );

  React.useEffect(() => headingRef.current?.focus(), [attendanceId]);

  return (
    <section
      aria-labelledby="attendance-history-heading"
      id="attendance-history-panel"
    >
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2
              className="font-heading text-xl font-semibold text-text-primary outline-none"
              id="attendance-history-heading"
              ref={headingRef}
              tabIndex={-1}
            >
              Correction history · {childName}
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              Recorded changes to this attendance mark, newest first.
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
          <div
            aria-label="Loading correction history"
            className="mt-5 space-y-3"
            role="status"
          >
            <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
            <div className="h-20 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
          </div>
        ) : history.error ? (
          <div className="mt-5 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-sm text-status-danger">{history.error}</p>
            <Button
              className="min-h-11"
              onClick={history.retry}
              type="button"
              variant="secondary"
            >
              Retry
            </Button>
          </div>
        ) : history.items.length === 0 ? (
          <p className="mt-5 rounded-xl border border-border-subtle bg-surface px-4 py-5 text-sm leading-6 text-text-muted">
            No corrections have been recorded for this attendance mark.
          </p>
        ) : (
          <ol
            aria-label={`Corrections for ${childName}`}
            className="mt-5 space-y-3"
          >
            {history.items.map((correction, index) => (
              <li
                className="rounded-xl border border-border-subtle bg-surface p-4"
                key={`${correction.correctedAt}-${index}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-text-primary">
                    {correction.previousStatus
                      ? statusLabel[correction.previousStatus]
                      : "Previous status unavailable"}{" "}
                    → {statusLabel[correction.newStatus]}
                  </p>
                  {correction.recoveredLegacy ? (
                    <Badge variant="secondary">Recovered last correction</Badge>
                  ) : null}
                </div>
                <p className="mt-2 text-sm leading-6 text-text-primary">
                  {correction.reason}
                </p>
                <p className="mt-2 text-sm text-text-muted">
                  <time dateTime={correction.correctedAt}>
                    {dateFormatter.format(new Date(correction.correctedAt))}
                  </time>{" "}
                  · {correction.correctedBy}
                </p>
                {correction.recoveredLegacy ? (
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    Only the last saved correction could be recovered; earlier
                    changes and the previous status are unavailable.
                  </p>
                ) : null}
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
