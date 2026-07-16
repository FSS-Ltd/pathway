"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Badge, Button, Card, DataTable, Input, Label, type ColumnDef } from "@pathway/ui";
import {
  AdminAttendanceRow,
  exportAttendanceCsv,
  fetchAttendanceSessionSummaries,
  setApiClientToken,
} from "../../lib/api-client";
import { toLocalDateKey } from "../../lib/date";
import { useAdminAccess } from "../../lib/use-admin-access";
import { canAccessAdminSection } from "../../lib/access";

const statusCopy: Record<AdminAttendanceRow["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const statusTone: Record<
  AdminAttendanceRow["status"],
  "default" | "accent" | "success"
> = {
  not_started: "default",
  in_progress: "accent",
  completed: "success",
};

/** Monday 00:00:00 local for the week containing d. */
function getWeekStart(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

/** End of week (Sunday 23:59:59.999) for the week containing d. */
function getWeekEnd(d: Date): Date {
  const start = getWeekStart(d);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  return end;
}

function defaultExportRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 30);
  return {
    from: toLocalDateKey(from),
    to: toLocalDateKey(to),
  };
}

export default function AttendancePage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [data, setData] = React.useState<AdminAttendanceRow[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [weekAnchor, setWeekAnchor] = React.useState(() => new Date());
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | AdminAttendanceRow["status"]
  >("all");
  const [exportFrom, setExportFrom] = React.useState(() => defaultExportRange().from);
  const [exportTo, setExportTo] = React.useState(() => defaultExportRange().to);
  const [exporting, setExporting] = React.useState<string | null>(null);
  const [exportError, setExportError] = React.useState<string | null>(null);
  const isAdmin = canAccessAdminSection(role);

  const weekStart = React.useMemo(() => getWeekStart(weekAnchor), [weekAnchor]);
  const weekEnd = React.useMemo(() => getWeekEnd(weekAnchor), [weekAnchor]);
  const fromStr = weekStart.toISOString();
  const toStr = weekEnd.toISOString();

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAttendanceSessionSummaries(fromStr, toStr);
      setData(result);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load attendance",
      );
    } finally {
      setIsLoading(false);
    }
  }, [fromStr, toStr]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
    void load();
  }, [sessionStatus, session, load]);

  const filteredData = React.useMemo(() => {
    let list = data;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((row) => row.title.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter((row) => row.status === statusFilter);
    }
    return list;
  }, [data, search, statusFilter]);

  const columns = React.useMemo<ColumnDef<AdminAttendanceRow>[]>(
    () => [
      {
        id: "session",
        header: "Session",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">{row.title}</span>
            <span className="text-xs text-text-muted">
              {row.timeRangeLabel} · {row.ageGroupLabel ?? "Group TBC"}
            </span>
          </div>
        ),
      },
      {
        id: "room",
        header: "Room",
        cell: (row) => (
          <span className="text-sm text-text-muted">
            {row.roomLabel ?? "TBC"}
          </span>
        ),
        width: "120px",
      },
      {
        id: "attendance",
        header: "Attendance",
        cell: (row) => (
          <span className="text-sm text-text-primary">
            {row.attendanceMarked} / {row.attendanceTotal}
          </span>
        ),
        width: "140px",
        align: "right",
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={statusTone[row.status]}>{statusCopy[row.status]}</Badge>
        ),
        align: "center",
        width: "140px",
      },
      {
        id: "actions",
        header: "",
        cell: (row) => (
          <Button size="sm" asChild>
            <Link href={`/attendance/${row.sessionId}`}>Take attendance</Link>
          </Button>
        ),
        width: "140px",
      },
    ],
    [],
  );

  const weekLabel =
    weekStart.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
    }) +
    " – " +
    weekEnd.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            Attendance
          </h1>
          <p className="text-sm text-text-muted">
            Sessions to mark or verify attendance for the selected week.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={load}>
            Refresh
          </Button>
          <Link
            href="/sessions"
            className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
          >
            View sessions
          </Link>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-9"
            onClick={() =>
              setWeekAnchor((d) => {
                const next = new Date(d);
                next.setDate(next.getDate() - 7);
                return next;
              })
            }
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[180px] text-sm font-medium text-text-primary">
            {weekLabel}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-9"
            onClick={() =>
              setWeekAnchor((d) => {
                const next = new Date(d);
                next.setDate(next.getDate() + 7);
                return next;
              })
            }
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <Input
          placeholder="Search by session title…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={statusFilter}
          onChange={(e) =>
            setStatusFilter(
              e.target.value as "all" | AdminAttendanceRow["status"],
            )
          }
          className="h-9 rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary"
        >
          <option value="all">All</option>
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="completed">Complete</option>
        </select>
      </div>

      <Card>
        {error ? (
          <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">
                Unable to load attendance list.
              </span>
              <Button size="sm" variant="secondary" onClick={load}>
                Retry
              </Button>
            </div>
            <p className="text-xs text-text-muted">{error}</p>
          </div>
        ) : (
          <DataTable
            data={filteredData}
            columns={columns}
            isLoading={isLoading}
            emptyMessage="No sessions in this week. Try another week or add sessions."
            onRowClick={(row) => router.push(`/attendance/${row.sessionId}`)}
          />
        )}
      </Card>

      {isAdmin && !isLoadingAccess && (
        <Card title="Export attendance" description="Download CSV reports for date range.">
          {exportError && (
            <div className="mb-4 rounded-md bg-status-danger/5 px-3 py-2 text-sm text-status-danger">
              {exportError}
            </div>
          )}
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
            <div className="flex flex-col gap-1">
              <Label htmlFor="export-from">From</Label>
              <Input
                id="export-from"
                type="date"
                value={exportFrom}
                onChange={(e) => setExportFrom(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="export-to">To</Label>
              <Input
                id="export-to"
                type="date"
                value={exportTo}
                onChange={(e) => setExportTo(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!exporting}
                onClick={async () => {
                  setExportError(null);
                  setExporting("children");
                  try {
                    await exportAttendanceCsv({
                      scope: "site",
                      from: exportFrom,
                      to: exportTo,
                      type: "children",
                    });
                  } catch (err) {
                    setExportError(err instanceof Error ? err.message : "Export failed");
                  } finally {
                    setExporting(null);
                  }
                }}
              >
                <Download className="mr-1 h-4 w-4" />
                {exporting === "children" ? "Exporting…" : "Export children"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!exporting}
                onClick={async () => {
                  setExportError(null);
                  setExporting("staff");
                  try {
                    await exportAttendanceCsv({
                      scope: "site",
                      from: exportFrom,
                      to: exportTo,
                      type: "staff",
                    });
                  } catch (err) {
                    setExportError(err instanceof Error ? err.message : "Export failed");
                  } finally {
                    setExporting(null);
                  }
                }}
              >
                <Download className="mr-1 h-4 w-4" />
                {exporting === "staff" ? "Exporting…" : "Export staff"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!!exporting}
                onClick={async () => {
                  setExportError(null);
                  setExporting("all");
                  try {
                    await exportAttendanceCsv({
                      scope: "site",
                      from: exportFrom,
                      to: exportTo,
                      type: "all",
                    });
                  } catch (err) {
                    setExportError(err instanceof Error ? err.message : "Export failed");
                  } finally {
                    setExporting(null);
                  }
                }}
              >
                <Download className="mr-1 h-4 w-4" />
                {exporting === "all" ? "Exporting…" : "Export all"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  const { from, to } = defaultExportRange();
                  setExportFrom(from);
                  setExportTo(to);
                  setExportError(null);
                }}
              >
                Reset to last 30 days
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
