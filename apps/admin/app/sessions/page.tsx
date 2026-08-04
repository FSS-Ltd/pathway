"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import {
  Badge,
  Button,
  Card,
  DataTable,
  Input,
  Select,
  type ColumnDef,
} from "@pathway/ui";
import {
  AdminAssignmentRow,
  AdminRotaDay,
  AdminSessionRow,
  fetchAssignmentsForOrg,
  fetchSessions,
  mapApiAssignmentsToRotaDays,
} from "../../lib/api-client";
import { toLocalDateKey } from "../../lib/date";
import { useOrgLabel } from "@/lib/use-org-ui";

const statusCopy: Record<AdminSessionRow["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const statusTone: Record<
  AdminSessionRow["status"],
  "default" | "accent" | "warning" | "success"
> = {
  not_started: "default",
  in_progress: "accent",
  completed: "success",
};

const assignmentStatusTone: Record<
  AdminAssignmentRow["status"],
  "default" | "accent" | "warning" | "success"
> = {
  pending: "warning",
  confirmed: "success",
  declined: "default",
};

const ISO_DATE_REGEX = /(\d{4}-\d{2}-\d{2})/g;

function formatOrdinalDate(isoDateStr: string): string {
  const d = new Date(isoDateStr);
  if (Number.isNaN(d.getTime())) return isoDateStr;
  const day = d.getDate();
  const suffix =
    day >= 11 && day <= 13
      ? "th"
      : day % 10 === 1
        ? "st"
        : day % 10 === 2
          ? "nd"
          : day % 10 === 3
            ? "rd"
            : "th";
  const month = d.toLocaleDateString(undefined, { month: "short" });
  return `${month} ${day}${suffix}`;
}

/** Replaces any YYYY-MM-DD in the title with "Feb 8th" style; leaves prefix (e.g. "Sunday ") as is. */
function normalizeSessionTitle(title: string): string {
  if (!title) return title;
  return title.replace(ISO_DATE_REGEX, (match) => formatOrdinalDate(match));
}

function formatTimeRange(startsAt?: string, endsAt?: string) {
  if (!startsAt || !endsAt) return { date: "Unknown", range: "-" };
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, range: `${startTime} - ${endTime}` };
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfWeek = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday as first day
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatWeekRange = (start: Date) => {
  const end = addDays(start, 6);
  const startLabel = start.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const endLabel = end.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  return `${startLabel} - ${endLabel}`;
};

export default function SessionsPage() {
  const title = useOrgLabel("/sessions", "Sessions & Rota");
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [activeTab, setActiveTab] = React.useState<"sessions" | "rota">(
    "sessions",
  );
  const [sessions, setSessions] = React.useState<AdminSessionRow[]>([]);
  const [isLoadingSessions, setIsLoadingSessions] = React.useState(true);
  const [sessionsError, setSessionsError] = React.useState<string | null>(null);
  const [sessionSearch, setSessionSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "not_started" | "in_progress" | "completed"
  >("all");
  const [sessionPage, setSessionPage] = React.useState(0);
  const sessionPageSize = 10;

  const [weekStart, setWeekStart] = React.useState<Date>(
    () => startOfWeek(new Date()),
  );
  const [rotaDays, setRotaDays] = React.useState<AdminRotaDay[]>([]);
  const [rotaLoading, setRotaLoading] = React.useState(false);
  const [rotaError, setRotaError] = React.useState<string | null>(null);

  const loadSessions = React.useCallback(async () => {
    setIsLoadingSessions(true);
    setSessionsError(null);
    try {
      const result = await fetchSessions();
      setSessions(result);
    } catch (err) {
      setSessionsError(
        err instanceof Error ? err.message : "Failed to load sessions",
      );
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadRota = React.useCallback(
    async (start: Date) => {
      setRotaLoading(true);
      setRotaError(null);
      const dateFrom = toLocalDateKey(start);
      const dateTo = toLocalDateKey(addDays(start, 6));
      try {
        const assignments = await fetchAssignmentsForOrg({
          dateFrom,
          dateTo,
        });
        const grouped = mapApiAssignmentsToRotaDays(assignments);
        setRotaDays(grouped);
      } catch (err) {
        setRotaError(
          err instanceof Error ? err.message : "Failed to load rota",
        );
      } finally {
        setRotaLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    // Only load data when session is authenticated
    if (sessionStatus === "authenticated" && session) {
      void loadSessions();
    }
  }, [sessionStatus, session, loadSessions]);

  React.useEffect(() => {
    // Only load data when session is authenticated
    if (sessionStatus === "authenticated" && session && activeTab === "rota") {
      void loadRota(weekStart);
    }
  }, [sessionStatus, session, activeTab, loadRota, weekStart]);

  const columns = React.useMemo<ColumnDef<AdminSessionRow>[]>(
    () => [
      {
        id: "date",
        header: "Date / Time",
        cell: (row) => {
          const { date, range } = formatTimeRange(row.startsAt, row.endsAt);
          return (
            <div className="flex flex-col">
              <span className="font-semibold text-text-primary">{date}</span>
              <span className="text-sm text-text-muted">{range}</span>
            </div>
          );
        },
      },
      {
        id: "title",
        header: "Session",
        cell: (row) => (
          <div className="flex flex-col">
            <span className="font-semibold text-text-primary">
              {normalizeSessionTitle(row.title)}
            </span>
            {row.ageGroup !== "-" || row.room !== "-" ? (
              <span className="text-sm text-text-muted">
                {row.ageGroup === row.room
                  ? row.ageGroup
                  : `${row.ageGroup} · ${row.room}`}
              </span>
            ) : null}
          </div>
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <Badge variant={statusTone[row.status]}>
            {statusCopy[row.status]}
          </Badge>
        ),
        align: "center",
        width: "140px",
      },
      {
        id: "attendance",
        header: "Attendance",
        cell: (row) => (
          <span className="text-sm font-medium text-text-primary">
            {row.attendanceMarked} / {row.attendanceTotal} marked
          </span>
        ),
        align: "right",
        width: "160px",
      },
    ],
    [],
  );

  const filteredSessions = React.useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    return sessions.filter((s) => {
      const matchesQuery = query
        ? s.title.toLowerCase().includes(query)
        : true;
      const matchesStatus = statusFilter === "all" ? true : s.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [sessions, sessionSearch, statusFilter]);

  const totalSessionPages = Math.max(
    1,
    Math.ceil(filteredSessions.length / sessionPageSize),
  );
  const paginatedSessions = React.useMemo(
    () =>
      filteredSessions.slice(
        sessionPage * sessionPageSize,
        (sessionPage + 1) * sessionPageSize,
      ),
    [filteredSessions, sessionPage, sessionPageSize],
  );

  React.useEffect(() => {
    if (sessionPage >= totalSessionPages) setSessionPage(0);
  }, [sessionPage, totalSessionPages]);

  const weekDates = React.useMemo(
    () => Array.from({ length: 7 }, (_, idx) => addDays(weekStart, idx)),
    [weekStart],
  );

  const rotaMap = React.useMemo(
    () => new Map(rotaDays.map((day) => [day.date, day.assignments])),
    [rotaDays],
  );

  // Staff-by-day grid: unique staff sorted by name, then for each (staffId, date) list of assignments
  const { rotaStaffOrder, rotaGrid } = React.useMemo(() => {
    const staffById = new Map<
      string,
      { staffId: string; staffName: string }
    >();
    const grid = new Map<string, Map<string, AdminAssignmentRow[]>>();

    rotaDays.forEach((day) => {
      day.assignments.forEach((a) => {
        if (!staffById.has(a.staffId)) {
          staffById.set(a.staffId, {
            staffId: a.staffId,
            staffName: a.staffName || `Staff ${a.staffId.slice(0, 8)}`,
          });
        }
        let row = grid.get(a.staffId);
        if (!row) {
          row = new Map();
          grid.set(a.staffId, row);
        }
        const list = row.get(day.date) ?? [];
        list.push(a);
        row.set(day.date, list);
      });
    });

    const staffOrder = Array.from(staffById.values()).sort((a, b) =>
      a.staffName.localeCompare(b.staffName, undefined, { sensitivity: "base" }),
    );

    return { rotaStaffOrder: staffOrder, rotaGrid: grid };
  }, [rotaDays]);

  const renderSessionsTab = () => (
    <Card
      title="Upcoming Sessions"
      description={
        process.env.NODE_ENV === "development"
          ? "Live data uses tenant scoping; mock data shown when API base URL is not set."
          : undefined
      }
      actions={
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadSessions}>
            Refresh
          </Button>
          <Button asChild size="sm" variant="secondary">
            <a href="/sessions/bulk-new">Bulk add</a>
          </Button>
          <Button asChild size="sm">
            <a href="/sessions/new">New session</a>
          </Button>
        </div>
      }
    >
      {sessionsError ? (
        <div className="flex flex-col gap-2 rounded-md bg-status-danger/5 p-4 text-sm text-status-danger">
          <span className="font-semibold">Unable to load sessions</span>
          <span>{sessionsError}</span>
          <div>
            <Button size="sm" variant="secondary" onClick={loadSessions}>
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <Input
              value={sessionSearch}
              onChange={(e) => setSessionSearch(e.target.value)}
              placeholder="Search sessions…"
              className="md:max-w-xs"
              aria-label="Search sessions"
            />
            <div className="flex items-center gap-2">
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as typeof statusFilter)
                }
                className="md:w-44"
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                <option value="not_started">Upcoming</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
              </Select>
            </div>
          </div>
          <DataTable
            data={paginatedSessions}
            columns={columns}
            isLoading={isLoadingSessions}
            emptyMessage="No sessions have been scheduled yet."
            rowKey={(row) => row.id}
            onRowClick={(row) => {
              router.push(`/sessions/${row.id}`);
            }}
          />
          {filteredSessions.length > sessionPageSize ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle pt-3">
              <p className="text-sm text-text-muted">
                Showing{" "}
                {sessionPage * sessionPageSize + 1}–
                {Math.min(
                  (sessionPage + 1) * sessionPageSize,
                  filteredSessions.length,
                )}{" "}
                of {filteredSessions.length}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={sessionPage === 0}
                  onClick={() => setSessionPage((p) => Math.max(0, p - 1))}
                  aria-label="Previous page"
                >
                  Previous
                </Button>
                <span className="text-sm text-text-muted">
                  Page {sessionPage + 1} of {totalSessionPages}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={sessionPage >= totalSessionPages - 1}
                  onClick={() =>
                    setSessionPage((p) =>
                      Math.min(totalSessionPages - 1, p + 1),
                    )
                  }
                  aria-label="Next page"
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );

  const renderRotaTab = () => {
    const dayColMinWidth = "min-w-[180px]";
    return (
      <div className="flex flex-col gap-3">
        <Card
          title="Staff Rota"
          description="Weekly view of who is scheduled on each session."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart((prev) => addDays(prev, -7))}
                aria-label="Previous week"
              >
                Previous
              </Button>
              <div className="rounded-md border border-border-subtle bg-surface px-3 py-1 text-sm text-text-primary">
                {formatWeekRange(weekStart)}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWeekStart(startOfWeek(new Date()))}
              >
                Today
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setWeekStart((prev) => addDays(prev, 7))}
                aria-label="Next week"
              >
                Next
              </Button>
            </div>
          }
        >
          {rotaError ? (
            <div className="flex flex-col gap-2 rounded-md bg-status-danger/5 p-4 text-sm text-status-danger">
              <span className="font-semibold">Unable to load rota</span>
              <span>{rotaError}</span>
              <div>
                <Button size="sm" variant="secondary" onClick={() => loadRota(weekStart)}>
                  Retry
                </Button>
              </div>
            </div>
          ) : rotaLoading ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    <th className="border-b border-border-subtle p-3 text-left text-sm font-medium text-text-muted" />
                    {weekDates.map((date) => (
                      <th
                        key={date.toISOString()}
                        className={`border-b border-border-subtle p-3 text-center text-sm font-medium text-text-muted ${dayColMinWidth}`}
                      >
                        <div className="h-4 w-20 animate-pulse rounded bg-muted mx-auto" />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[1, 2, 3].map((i) => (
                    <tr key={i}>
                      <td className="border-b border-border-subtle p-3">
                        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
                      </td>
                      {weekDates.map((_, dayIdx) => (
                        <td
                          key={dayIdx}
                          className={`border-b border-border-subtle p-3 ${dayColMinWidth}`}
                        >
                          <div className="h-14 animate-pulse rounded bg-muted" />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse table-fixed" style={{ minWidth: "max-content" }}>
                <thead>
                  <tr>
                    <th className="w-52 shrink-0 border-b border-border-subtle bg-surface-alt p-3 text-left text-sm font-medium text-text-muted">
                      Staff
                    </th>
                    {weekDates.map((date) => {
                      const dateKey = toLocalDateKey(date);
                      const count = rotaMap.get(dateKey)?.length ?? 0;
                      const dayLabel = date.toLocaleDateString(undefined, {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      });
                      return (
                        <th
                          key={dateKey}
                          className={`border-b border-border-subtle bg-surface-alt p-3 text-center text-sm font-medium text-text-muted ${dayColMinWidth}`}
                        >
                          <div>{dayLabel}</div>
                          <div className="text-xs font-normal text-text-muted">
                            {count} {count === 1 ? "session" : "sessions"}
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rotaStaffOrder.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        className="border-b border-border-subtle p-6 text-center text-sm text-text-muted"
                      >
                        No staff are scheduled in this week yet.
                      </td>
                    </tr>
                  ) : (
                    rotaStaffOrder.map((staff) => (
                      <tr
                        key={staff.staffId}
                        className="hover:bg-surface-alt/50 transition-colors"
                      >
                        <td className="w-52 shrink-0 border-b border-border-subtle p-3 align-top">
                          <span className="text-sm font-medium text-accent-primary">
                            {staff.staffName}
                          </span>
                        </td>
                        {weekDates.map((date) => {
                          const dateKey = toLocalDateKey(date);
                          const cellAssignments =
                            rotaGrid.get(staff.staffId)?.get(dateKey) ?? [];
                          return (
                            <td
                              key={dateKey}
                              className={`border-b border-border-subtle p-3 align-top ${dayColMinWidth}`}
                            >
                              {cellAssignments.length === 0 ? (
                                <div
                                  className="flex min-h-[56px] items-center justify-center rounded-md border border-dashed border-border-subtle bg-surface-alt/30"
                                  aria-hidden
                                >
                                  <span className="text-text-muted text-xl leading-none">+</span>
                                </div>
                              ) : (
                                <div className="flex flex-col gap-1.5">
                                  {cellAssignments.map((assignment) => {
                                    const { range } = formatTimeRange(
                                      assignment.startsAt,
                                      assignment.endsAt,
                                    );
                                    const tone =
                                      assignmentStatusTone[assignment.status];
                                    const defaultBg =
                                      tone === "success"
                                        ? "bg-status-success/10"
                                        : tone === "warning"
                                          ? "bg-status-warning/10"
                                          : "bg-surface-alt";
                                    const borderStyle = assignment.sessionGroupColor
                                      ? { borderColor: assignment.sessionGroupColor }
                                      : undefined;
                                    const bgStyle = assignment.sessionGroupColor
                                      ? {
                                          backgroundColor: `${assignment.sessionGroupColor}20`,
                                        }
                                      : undefined;
                                    return (
                                      <button
                                        key={assignment.id}
                                        type="button"
                                        onClick={() =>
                                          router.push(
                                            `/sessions/${assignment.sessionId}`,
                                          )
                                        }
                                        className={`flex w-full flex-col gap-0.5 rounded-md border-2 px-2 py-1.5 text-left text-sm transition hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
                                          !assignment.sessionGroupColor
                                            ? `border-accent-secondary ${defaultBg}`
                                            : "bg-surface"
                                        }`}
                                        style={
                                          assignment.sessionGroupColor
                                            ? {
                                                ...borderStyle,
                                                ...bgStyle,
                                              }
                                            : undefined
                                        }
                                      >
                                        <span className="truncate font-bold text-text-primary">
                                          {assignment.sessionGroupName ??
                                            assignment.sessionTitle ??
                                            "Session"}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                          {range}
                                        </span>
                                        <span className="text-xs text-text-muted">
                                          {assignment.roleLabel}
                                          {assignment.status !== "confirmed" && (
                                            <span className="ml-1">
                                              · {assignment.status === "pending" ? "Pending" : "Declined"}
                                            </span>
                                          )}
                                        </span>
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary font-heading">
            {title}
          </h1>
          <p className="text-sm text-text-muted">
            Manage sessions and see who is scheduled on the rota.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-surface-alt p-1">
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === "sessions"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-muted"
            }`}
            onClick={() => setActiveTab("sessions")}
          >
            Sessions
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              activeTab === "rota"
                ? "bg-white text-text-primary shadow-sm"
                : "text-text-muted"
            }`}
            onClick={() => setActiveTab("rota")}
          >
            Rota
          </button>
        </div>
      </div>

      {activeTab === "sessions" ? renderSessionsTab() : renderRotaTab()}
    </div>
  );
}
