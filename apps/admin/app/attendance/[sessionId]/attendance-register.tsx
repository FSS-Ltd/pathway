"use client";

import React from "react";
import { RotateCcw } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  DataTable,
  type ColumnDef,
  Input,
} from "@pathway/ui";
import type {
  AdminAttendanceDetail,
  SaveAttendanceRow,
} from "../../../lib/api-client";
import { getInitials } from "../../../lib/names";
import {
  AttendanceStatusControls,
  STATUS_LABEL,
  type AttendanceDisplayStatus,
  type AttendanceMarkStatus,
} from "./attendance-status-controls";

type AttendanceDisplayRow = AdminAttendanceDetail["rows"][number];

const API_STATUS: Record<AttendanceMarkStatus, SaveAttendanceRow["status"]> = {
  present: "PRESENT",
  absent: "ABSENT",
  late: "LATE",
};

const PROGRESS_LABEL: Record<AdminAttendanceDetail["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const PROGRESS_TONE: Record<
  AdminAttendanceDetail["status"],
  "default" | "accent" | "success"
> = {
  not_started: "default",
  in_progress: "accent",
  completed: "success",
};

type AttendanceRegisterProps = {
  detail: AdminAttendanceDetail;
  onSave: (rows: SaveAttendanceRow[]) => Promise<AdminAttendanceDetail>;
  onRefresh?: () => Promise<void> | void;
};

export function AttendanceRegister({
  detail,
  onSave,
  onRefresh,
}: AttendanceRegisterProps) {
  const [authoritative, setAuthoritative] =
    React.useState<AdminAttendanceDetail>(detail);
  const [draftStatus, setDraftStatus] = React.useState<
    Map<string, AttendanceDisplayStatus>
  >(() => statusMap(detail));
  const [reasons, setReasons] = React.useState<Record<string, string>>({});
  const [validation, setValidation] = React.useState<Record<string, string>>(
    {},
  );
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | AttendanceDisplayStatus
  >("all");
  const [childSearch, setChildSearch] = React.useState("");
  const successRef = React.useRef<HTMLDivElement>(null);
  const submissionGate = React.useRef(false);
  const detailVersion = React.useMemo(
    () =>
      detail.rows
        .map((row) => `${row.childId}:${row.attendanceId ?? ""}:${row.status}`)
        .join("|"),
    [detail.rows],
  );

  React.useEffect(() => {
    setAuthoritative(detail);
    setDraftStatus(statusMap(detail));
    setReasons({});
    setValidation({});
    setSaveError(null);
    setSaveSuccess(false);
  }, [detail, detailVersion]);

  React.useEffect(() => {
    if (saveSuccess) successRef.current?.focus();
  }, [saveSuccess]);

  const changes = React.useMemo(
    () =>
      authoritative.rows.flatMap((row) => {
        const status = draftStatus.get(row.childId) ?? row.status;
        return status !== "unknown" && status !== row.status
          ? [{ row, status }]
          : [];
      }),
    [authoritative.rows, draftStatus],
  );

  const selectStatus = React.useCallback(
    (childId: string, status: AttendanceMarkStatus) => {
      setDraftStatus((current) => {
        const next = new Map(current);
        next.set(childId, status);
        return next;
      });
      setValidation((current) => ({ ...current, [childId]: "" }));
      setSaveError(null);
      setSaveSuccess(false);
    },
    [],
  );

  const markAllPresent = React.useCallback(() => {
    setDraftStatus((current) => {
      const next = new Map(current);
      authoritative.rows.forEach((row) => next.set(row.childId, "present"));
      return next;
    });
    setSaveError(null);
    setSaveSuccess(false);
  }, [authoritative.rows]);

  const resetChanges = React.useCallback(() => {
    setDraftStatus(statusMap(authoritative));
    setReasons({});
    setValidation({});
    setSaveError(null);
    setSaveSuccess(false);
  }, [authoritative]);

  const save = React.useCallback(async () => {
    if (submissionGate.current || changes.length === 0) return;

    const nextValidation: Record<string, string> = {};
    const rows = changes.map<SaveAttendanceRow>(({ row, status }) => {
      const correctionReason = reasons[row.childId]?.trim();
      if (row.attendanceId && !correctionReason) {
        nextValidation[row.childId] = "Enter a correction reason.";
      }
      return {
        childId: row.childId,
        status: API_STATUS[status],
        ...(row.attendanceId && correctionReason ? { correctionReason } : {}),
      };
    });

    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) return;

    submissionGate.current = true;
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const updated = await onSave(rows);
      setAuthoritative(updated);
      setDraftStatus(statusMap(updated));
      setReasons({});
      setValidation({});
      setSaveSuccess(true);
    } catch {
      setSaveError(
        "No attendance changes were saved. Check the register and retry.",
      );
    } finally {
      submissionGate.current = false;
      setIsSaving(false);
    }
  }, [changes, onSave, reasons]);

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
        header: "Attendance status",
        cell: (row) => {
          const selected = draftStatus.get(row.childId) ?? row.status;
          return (
            <AttendanceStatusControls
              disabled={isSaving}
              onReasonChange={(value) => {
                setReasons((current) => ({
                  ...current,
                  [row.childId]: value,
                }));
                setValidation((current) => ({
                  ...current,
                  [row.childId]: "",
                }));
                setSaveError(null);
              }}
              onSelect={(status) => selectStatus(row.childId, status)}
              reason={reasons[row.childId] ?? ""}
              row={row}
              selected={selected}
              validation={validation[row.childId]}
            />
          );
        },
        width: "520px",
      },
    ],
    [draftStatus, isSaving, reasons, selectStatus, validation],
  );

  const filteredRows = React.useMemo(() => {
    const query = childSearch.trim().toLowerCase();
    return authoritative.rows.filter((row) => {
      const selected = draftStatus.get(row.childId) ?? row.status;
      return (
        (!query || row.childName.toLowerCase().includes(query)) &&
        (statusFilter === "all" || selected === statusFilter)
      );
    });
  }, [authoritative.rows, childSearch, draftStatus, statusFilter]);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-heading text-2xl font-semibold text-text-primary">
                  {authoritative.title}
                </h1>
                <Badge variant={PROGRESS_TONE[authoritative.status]}>
                  {PROGRESS_LABEL[authoritative.status]}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-text-muted">
                {authoritative.timeRangeLabel} ·{" "}
                {authoritative.roomLabel ?? "Room TBC"} ·{" "}
                {authoritative.ageGroupLabel ?? "Group TBC"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {changes.length > 0 ? (
                <span className="text-sm font-semibold text-text-primary">
                  {changes.length} pending{" "}
                  {changes.length === 1 ? "change" : "changes"}
                </span>
              ) : null}
              {onRefresh ? (
                <Button
                  className="min-h-11"
                  disabled={isSaving}
                  onClick={() => void onRefresh()}
                  type="button"
                  variant="secondary"
                >
                  Refresh
                </Button>
              ) : null}
              <Button
                className="min-h-11"
                disabled={changes.length === 0 || isSaving}
                id="attendance-save"
                onClick={() => void save()}
                type="button"
              >
                {isSaving ? "Saving…" : "Save register"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      {saveSuccess ? (
        <div
          className="rounded-md border border-status-success/30 bg-status-success/10 px-4 py-3 text-sm text-status-success"
          ref={successRef}
          role="status"
          tabIndex={-1}
        >
          Attendance saved from the server response.
        </div>
      ) : null}
      {saveError ? (
        <div
          className="rounded-md border border-status-danger/20 bg-status-danger/5 p-4 text-sm text-status-danger"
          role="alert"
        >
          <p className="font-semibold">Save failed</p>
          <p>{saveError}</p>
          <Button
            className="mt-3 min-h-11"
            disabled={isSaving}
            id="attendance-retry"
            onClick={() => void save()}
            type="button"
            variant="secondary"
          >
            Retry save
          </Button>
        </div>
      ) : null}

      <Card title="Saved attendance summary">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {(["present", "absent", "late", "unknown"] as const).map((status) => (
            <div
              className="rounded-md border border-border-subtle bg-surface px-3 py-2"
              id={`attendance-summary-${status}`}
              key={status}
            >
              <p className="text-xs text-text-muted">{STATUS_LABEL[status]}</p>
              <p className="text-lg font-semibold text-text-primary">
                {authoritative.summary[status]}
              </p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Attendance details">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-2">
            {(["all", "present", "absent", "late", "unknown"] as const).map(
              (status) => (
                <Button
                  aria-pressed={statusFilter === status}
                  className="min-h-11"
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  type="button"
                  variant={statusFilter === status ? "primary" : "outline"}
                >
                  {status === "all" ? "All" : STATUS_LABEL[status]}
                </Button>
              ),
            )}
          </div>
          <Input
            aria-label="Search children"
            className="min-h-11 max-w-xs"
            onChange={(event) => setChildSearch(event.target.value)}
            placeholder="Search by child name…"
            value={childSearch}
          />
          <Button
            className="min-h-11"
            disabled={isSaving}
            onClick={markAllPresent}
            type="button"
            variant="outline"
          >
            Mark all present
          </Button>
          <Button
            className="min-h-11 gap-2"
            disabled={changes.length === 0 || isSaving}
            onClick={resetChanges}
            type="button"
            variant="outline"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            Reset changes
          </Button>
        </div>
        <DataTable
          columns={columns}
          data={filteredRows}
          emptyMessage={
            authoritative.rows.length === 0
              ? "No children in this session."
              : "No children match the filter."
          }
          isLoading={false}
        />
      </Card>
    </div>
  );
}

function AttendanceChildCell({
  childId,
  childName,
}: {
  childId: string;
  childName: string;
}) {
  const [imageError, setImageError] = React.useState(false);

  React.useEffect(() => setImageError(false), [childId]);

  return (
    <div className="flex min-w-0 items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-subtle text-xs font-semibold text-accent-strong">
        {!imageError ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            height={40}
            onError={() => setImageError(true)}
            src={`/api/children/${childId}/photo`}
            width={40}
          />
        ) : (
          <span aria-hidden>{getInitials(childName)}</span>
        )}
      </div>
      <span className="min-w-0 text-sm font-semibold text-text-primary">
        {childName}
      </span>
    </div>
  );
}

function statusMap(detail: AdminAttendanceDetail) {
  return new Map(detail.rows.map((row) => [row.childId, row.status]));
}
