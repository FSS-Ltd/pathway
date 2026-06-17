"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ArrowLeft } from "lucide-react";
import { Badge, Button, Card, DataTable, Input, type ColumnDef } from "@pathway/ui";
import {
  AdminAttendanceDetail,
  fetchAttendanceDetailBySessionId,
  saveAttendanceForSession,
  setApiClientToken,
  type SaveAttendanceRow,
} from "../../../lib/api-client";
import { getInitials } from "../../../lib/names";

type ChildStatus = "present" | "absent" | "late" | "unknown";
type AttendanceDisplayRow = {
  childId: string;
  childName: string;
  status: ChildStatus;
};

const statusCopy: Record<AdminAttendanceDetail["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const statusTone: Record<
  AdminAttendanceDetail["status"],
  "default" | "accent" | "success"
> = {
  not_started: "default",
  in_progress: "accent",
  completed: "success",
};

const childStatusTone: Record<
  ChildStatus,
  "success" | "warning" | "default" | "accent"
> = {
  present: "success",
  absent: "warning",
  late: "accent",
  unknown: "default",
};

const STATUS_OPTIONS: ChildStatus[] = ["present", "absent", "late", "unknown"];

function AttendanceChildCell({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [imageError, setImageError] = React.useState(false);
  const showImage = !imageError;

  React.useEffect(() => {
    setImageError(false);
  }, [childId]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-xs font-semibold text-accent-strong">
        {showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/children/${childId}/photo`}
            alt=""
            width={40}
            height={40}
            className="h-full w-full object-cover"
            onError={() => setImageError(true)}
          />
        ) : null}
        <span className={showImage ? "hidden" : ""} aria-hidden>
          {getInitials(childName)}
        </span>
      </div>
      <span className="min-w-0 text-sm font-semibold text-text-primary">
        {childName}
      </span>
    </div>
  );
}

export default function AttendanceDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const sessionId = params.sessionId;

  const [detail, setDetail] = React.useState<AdminAttendanceDetail | null>(
    null,
  );
  const [editRows, setEditRows] = React.useState<
    Map<string, ChildStatus>
  >(new Map());
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [notFound, setNotFound] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "present" | "absent" | "late" | "unmarked"
  >("all");
  const [childSearch, setChildSearch] = React.useState("");

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const result = await fetchAttendanceDetailBySessionId(sessionId);
      if (!result) {
        setNotFound(true);
        setDetail(null);
        setEditRows(new Map());
      } else {
        setDetail(result);
        setEditRows(
          new Map(result.rows.map((r) => [r.childId, r.status])),
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load attendance",
      );
      setDetail(null);
      setEditRows(new Map());
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
    void load();
  }, [sessionStatus, session, load]);

  const hasChanges = React.useMemo(() => {
    if (!detail) return false;
    for (const row of detail.rows) {
      const edited = editRows.get(row.childId);
      if (edited !== row.status) return true;
    }
    return editRows.size !== detail.rows.length ? true : false;
  }, [detail, editRows]);

  const setStatus = React.useCallback((childId: string, status: ChildStatus) => {
    setEditRows((prev) => {
      const next = new Map(prev);
      next.set(childId, status);
      return next;
    });
    setSaveError(null);
  }, []);

  const markAllPresent = React.useCallback(() => {
    if (!detail) return;
    setEditRows((prev) => {
      const next = new Map(prev);
      for (const row of detail.rows) {
        next.set(row.childId, "present");
      }
      return next;
    });
    setSaveError(null);
  }, [detail]);

  const clearAll = React.useCallback(() => {
    if (!detail) return;
    setEditRows((prev) => {
      const next = new Map(prev);
      for (const row of detail.rows) {
        next.set(row.childId, "unknown");
      }
      return next;
    });
    setSaveError(null);
  }, [detail]);

  const handleSave = React.useCallback(async () => {
    if (!detail || !hasChanges) return;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const rows: SaveAttendanceRow[] = detail.rows.map((r) => ({
        childId: r.childId,
        status: editRows.get(r.childId) ?? r.status,
      }));
      const updated = await saveAttendanceForSession(sessionId, rows);
      setDetail(updated);
      setEditRows(new Map(updated.rows.map((r) => [r.childId, r.status])));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setSaveError(
        err instanceof Error ? err.message : "Failed to save attendance",
      );
    } finally {
      setIsSaving(false);
    }
  }, [detail, sessionId, editRows, hasChanges]);

  const displayRows = React.useMemo(() => {
    if (!detail) return [];
    return detail.rows.map((r) => ({
      ...r,
      status: editRows.get(r.childId) ?? r.status,
    }));
  }, [detail, editRows]);

  const columns = React.useMemo<ColumnDef<AttendanceDisplayRow>[]>(
    () => [
      {
        id: "child",
        header: "Child",
        cell: (row) => (
          <AttendanceChildCell
            childId={row.childId}
            childName={row.childName}
          />
        ),
      },
      {
        id: "status",
        header: "Status",
        cell: (row) => (
          <div className="flex flex-wrap gap-1">
            {STATUS_OPTIONS.map((status) => (
              <Button
                key={status}
                size="sm"
                variant={row.status === status ? "primary" : "outline"}
                className="h-8 min-w-0 px-2 text-xs capitalize"
                onClick={() => setStatus(row.childId, status)}
              >
                {status}
              </Button>
            ))}
          </div>
        ),
        width: "320px",
      },
    ],
    [setStatus],
  );

  const summaryFromRows = React.useMemo(() => {
    const s = { present: 0, absent: 0, late: 0, unknown: 0 };
    displayRows.forEach((r) => {
      s[r.status] += 1;
    });
    return s;
  }, [displayRows]);

  const filteredDisplayRows = React.useMemo(() => {
    let list = displayRows;
    if (childSearch.trim()) {
      const q = childSearch.trim().toLowerCase();
      list = list.filter((r) => r.childName.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") {
      list = list.filter((r) => r.status === statusFilter);
    }
    return list;
  }, [displayRows, childSearch, statusFilter]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/attendance" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to attendance
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <span className="text-sm text-text-muted">Unsaved changes</span>
          )}
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {saveSuccess && (
        <div className="rounded-md border border-status-success/30 bg-status-success/10 px-4 py-2 text-sm text-status-success">
          Attendance saved.
        </div>
      )}
      {saveError && (
        <div className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger">
          <p className="font-semibold">Save failed</p>
          <p className="text-xs text-text-muted">{saveError}</p>
          <Button size="sm" variant="secondary" onClick={handleSave} className="mt-2">
            Retry
          </Button>
        </div>
      )}

      {sessionStatus === "loading" || (sessionStatus === "authenticated" && isLoading) ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex flex-col gap-3">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        </div>
      ) : notFound ? (
        <Card title="Attendance Not Found">
          <p className="text-sm text-text-muted">
            We couldn’t find attendance for session <strong>{sessionId}</strong>.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => router.push("/attendance")}>
              Back to attendance
            </Button>
          </div>
        </Card>
      ) : error ? (
        <Card title="Something Went Wrong">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/attendance")}>
              Back
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : detail ? (
        <div className="flex flex-col gap-4">
          <Card>
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-primary font-heading">
                  {detail.title}
                </h1>
                <Badge variant={statusTone[detail.status]}>
                  {statusCopy[detail.status]}
                </Badge>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={markAllPresent}
                  className="capitalize"
                >
                  Mark all present
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={clearAll}
                  className="capitalize"
                >
                  Clear all
                </Button>
              </div>
              <p className="text-sm text-text-muted">
                {detail.timeRangeLabel} · {detail.roomLabel ?? "Room TBC"} ·{" "}
                {detail.ageGroupLabel ?? "Group TBC"}
              </p>
            </div>
          </Card>

          <Card title="Summary">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { label: "Present", value: summaryFromRows.present },
                { label: "Absent", value: summaryFromRows.absent },
                { label: "Late", value: summaryFromRows.late },
                { label: "Unknown", value: summaryFromRows.unknown },
              ].map((item) => (
                <div
                  key={item.label}
                  className="rounded-md border border-border-subtle bg-surface px-3 py-2"
                >
                  <p className="text-xs text-text-muted">{item.label}</p>
                  <p className="text-lg font-semibold text-text-primary">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card title="Attendance Details">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {(["all", "present", "absent", "late", "unmarked"] as const).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={statusFilter === f ? "primary" : "outline"}
                    className="capitalize"
                    onClick={() => setStatusFilter(f)}
                  >
                    {f === "all" ? "All" : f === "unmarked" ? "Unmarked" : f}
                  </Button>
                ))}
              </div>
              <Input
                placeholder="Search by child name…"
                value={childSearch}
                onChange={(e) => setChildSearch(e.target.value)}
                className="max-w-xs"
              />
            </div>
            <DataTable
              data={filteredDisplayRows}
              columns={columns}
              isLoading={false}
              emptyMessage={displayRows.length === 0 ? "No children in this session." : "No children match the filter."}
            />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
