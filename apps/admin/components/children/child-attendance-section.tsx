"use client";

import * as React from "react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import { Download } from "lucide-react";
import { exportAttendanceCsv } from "../../lib/api-client";
import { toLocalDateKey } from "../../lib/date";
import {
  fetchChildAttendance,
  type ChildAttendanceEntry,
} from "../../lib/child-attendance-api";

function formatWhen(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function ChildAttendanceSection({
  childId,
  canExport,
}: {
  childId: string;
  canExport: boolean;
}) {
  const [entries, setEntries] = React.useState<ChildAttendanceEntry[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [state, setState] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [message, setMessage] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [from, setFrom] = React.useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 30);
    return toLocalDateKey(date);
  });
  const [to, setTo] = React.useState(() => toLocalDateKey(new Date()));

  const load = React.useCallback(async () => {
    setState("loading");
    setMessage(null);
    try {
      const page = await fetchChildAttendance(childId);
      setEntries(page.items);
      setNextCursor(page.nextCursor);
      setState("ready");
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to load attendance.",
      );
      setState("error");
    }
  }, [childId]);
  React.useEffect(() => {
    void load();
  }, [load]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMessage(null);
    try {
      const page = await fetchChildAttendance(childId, nextCursor);
      setEntries((previous) => [...previous, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setMessage(
        cause instanceof Error
          ? cause.message
          : "Unable to load more attendance.",
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const download = async () => {
    if (from > to) {
      setMessage("From date must be on or before To date.");
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      await exportAttendanceCsv({ scope: "child", id: childId, from, to });
    } catch (cause) {
      setMessage(
        cause instanceof Error ? cause.message : "Unable to export attendance.",
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <section
      id="attendance"
      aria-labelledby="profile-attendance-heading"
      className="scroll-mt-6"
    >
      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2
              id="profile-attendance-heading"
              className="text-lg font-bold text-text-primary"
            >
              Attendance
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Recent attendance marks across sessions.
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void load()}
            disabled={state === "loading"}
          >
            Refresh
          </Button>
        </div>
        {message ? (
          <p role="alert" className="mt-3 text-sm text-status-danger">
            {message}
          </p>
        ) : null}
        {state === "loading" ? (
          <p role="status" className="mt-4 text-sm text-text-muted">
            Loading attendance…
          </p>
        ) : null}
        {state === "ready" && entries.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No attendance has been recorded yet.
          </p>
        ) : null}
        {state === "ready" && entries.length > 0 ? (
          <ol className="mt-4 divide-y divide-border-subtle">
            {entries.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-text-primary">
                    {entry.sessionTitle ?? "Session"}
                  </p>
                  <time dateTime={entry.timestamp} className="text-text-muted">
                    {formatWhen(entry.timestamp)}
                  </time>
                </div>
                <Badge
                  variant={
                    entry.status === "PRESENT"
                      ? "success"
                      : entry.status === "LATE"
                        ? "warning"
                        : "default"
                  }
                >
                  {entry.status === "PRESENT"
                    ? "Present"
                    : entry.status === "LATE"
                      ? "Late"
                      : "Absent"}
                </Badge>
              </li>
            ))}
          </ol>
        ) : null}
        {state === "ready" && nextCursor ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            disabled={loadingMore}
            onClick={() => void loadMore()}
          >
            {loadingMore ? "Loading…" : "Load older attendance"}
          </Button>
        ) : null}
        {canExport ? (
          <div className="mt-5 border-t border-border-subtle pt-5">
            <h3 className="font-semibold text-text-primary">
              Export attendance record
            </h3>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="child-export-from">From</Label>
                <Input
                  id="child-export-from"
                  type="date"
                  value={from}
                  onChange={(event) => setFrom(event.target.value)}
                  className="mt-1 max-w-40"
                />
              </div>
              <div>
                <Label htmlFor="child-export-to">To</Label>
                <Input
                  id="child-export-to"
                  type="date"
                  value={to}
                  onChange={(event) => setTo(event.target.value)}
                  className="mt-1 max-w-40"
                />
              </div>
              <Button
                size="sm"
                disabled={exporting}
                onClick={() => void download()}
              >
                <Download className="mr-1 h-4 w-4" />
                {exporting ? "Exporting…" : "Export CSV"}
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
