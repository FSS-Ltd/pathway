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
import { AdminAttendanceSaveError } from "../../../lib/attendance-save-error";
import { subscribeToActiveSiteChanges } from "../../../lib/active-site-events";
import { getInitials } from "../../../lib/names";
import {
  AttendanceStatusControls,
  STATUS_LABEL,
  type AttendanceDisplayStatus,
  type AttendanceMarkStatus,
} from "./attendance-status-controls";
import { AttendanceHistoryPanel } from "./attendance-history-panel";

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
  canManage: boolean;
  onSave: (rows: SaveAttendanceRow[]) => Promise<AdminAttendanceDetail>;
  onReconcile?: () => Promise<AdminAttendanceDetail>;
  onRefresh?: () => Promise<void> | void;
};

export function AttendanceRegister({
  detail,
  canManage,
  onSave,
  onReconcile,
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
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = React.useState(false);
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | AttendanceDisplayStatus
  >("all");
  const [childSearch, setChildSearch] = React.useState("");
  const [selectedHistory, setSelectedHistory] = React.useState<{
    attendanceId: string;
    childName: string;
  } | null>(null);
  const [historyVersion, setHistoryVersion] = React.useState(0);
  const successRef = React.useRef<HTMLDivElement>(null);
  const submissionGate = React.useRef(false);
  const uncertainRowsRef = React.useRef<SaveAttendanceRow[] | null>(null);
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
    setSaveSuccess(null);
    setNeedsReconciliation(false);
    uncertainRowsRef.current = null;
  }, [detail, detailVersion]);

  React.useEffect(() => {
    if (saveSuccess) successRef.current?.focus();
  }, [saveSuccess]);

  React.useEffect(
    () => subscribeToActiveSiteChanges(() => setSelectedHistory(null)),
    [],
  );

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
      setSaveSuccess(null);
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
    setSaveSuccess(null);
  }, [authoritative.rows]);

  const resetChanges = React.useCallback(() => {
    setDraftStatus(statusMap(authoritative));
    setReasons({});
    setValidation({});
    setSaveError(null);
    setSaveSuccess(null);
  }, [authoritative]);

  const reconcileUnknownOutcome = React.useCallback(
    async (rows: SaveAttendanceRow[]) => {
      if (!onReconcile) {
        uncertainRowsRef.current = rows;
        setNeedsReconciliation(true);
        setSaveError(
          "The save response was interrupted, so the outcome is unknown. Check the server register before retrying.",
        );
        return;
      }

      try {
        const updated = await onReconcile();
        setAuthoritative(updated);
        if (hasAppliedRows(updated, rows)) {
          setDraftStatus(statusMap(updated));
          setReasons({});
          setValidation({});
          setSaveError(null);
          setSaveSuccess(
            "Attendance was confirmed after refreshing the server register.",
          );
        } else {
          setSaveError(
            "The save response was interrupted. The latest server register was loaded and your pending choices were preserved. Review them before retrying.",
          );
        }
        uncertainRowsRef.current = null;
        setNeedsReconciliation(false);
        setHistoryVersion((version) => version + 1);
      } catch {
        uncertainRowsRef.current = rows;
        setNeedsReconciliation(true);
        setSaveError(
          "The save response was interrupted, so the outcome is unknown. Check the server register before retrying.",
        );
      }
    },
    [onReconcile],
  );

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
    setSaveSuccess(null);
    try {
      const updated = await onSave(rows);
      setAuthoritative(updated);
      setDraftStatus(statusMap(updated));
      setReasons({});
      setValidation({});
      setNeedsReconciliation(false);
      uncertainRowsRef.current = null;
      setHistoryVersion((version) => version + 1);
      setSaveSuccess("Attendance saved from the server response.");
    } catch (cause) {
      if (
        cause instanceof AdminAttendanceSaveError &&
        cause.outcome === "rejected"
      ) {
        setSaveError(
          "No attendance changes were saved. Check the register and retry.",
        );
      } else {
        await reconcileUnknownOutcome(rows);
      }
    } finally {
      submissionGate.current = false;
      setIsSaving(false);
    }
  }, [changes, onSave, reasons, reconcileUnknownOutcome]);

  const checkServerStatus = React.useCallback(async () => {
    const rows = uncertainRowsRef.current;
    if (!rows || submissionGate.current) return;
    submissionGate.current = true;
    setIsSaving(true);
    await reconcileUnknownOutcome(rows);
    submissionGate.current = false;
    setIsSaving(false);
  }, [reconcileUnknownOutcome]);

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
          const attendanceId = row.attendanceId;
          return (
            <div className="space-y-2">
              {canManage ? (
                <AttendanceStatusControls
                  disabled={isSaving || needsReconciliation}
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
              ) : (
                <span className="text-sm font-medium text-text-primary">
                  {STATUS_LABEL[row.status]}
                </span>
              )}
              {attendanceId ? (
                <Button
                  aria-controls={
                    selectedHistory?.attendanceId === attendanceId
                      ? "attendance-history-panel"
                      : undefined
                  }
                  aria-expanded={selectedHistory?.attendanceId === attendanceId}
                  className="min-h-11"
                  id={`attendance-history-${row.childId}`}
                  onClick={() =>
                    setSelectedHistory({
                      attendanceId,
                      childName: row.childName,
                    })
                  }
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  View history
                </Button>
              ) : null}
            </div>
          );
        },
        width: "520px",
      },
    ],
    [
      canManage,
      draftStatus,
      isSaving,
      needsReconciliation,
      reasons,
      selectStatus,
      selectedHistory?.attendanceId,
      validation,
    ],
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
                  disabled={isSaving || needsReconciliation}
                  onClick={() => void onRefresh()}
                  type="button"
                  variant="secondary"
                >
                  Refresh
                </Button>
              ) : null}
              {canManage ? (
                <Button
                  className="min-h-11"
                  disabled={
                    changes.length === 0 || isSaving || needsReconciliation
                  }
                  id="attendance-save"
                  onClick={() => void save()}
                  type="button"
                >
                  {isSaving ? "Saving…" : "Save register"}
                </Button>
              ) : null}
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
          {saveSuccess}
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
            onClick={() =>
              void (needsReconciliation ? checkServerStatus() : save())
            }
            type="button"
            variant="secondary"
          >
            {needsReconciliation ? "Check server status" : "Retry save"}
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
          {canManage ? (
            <>
              <Button
                className="min-h-11"
                disabled={isSaving || needsReconciliation}
                onClick={markAllPresent}
                type="button"
                variant="outline"
              >
                Mark all present
              </Button>
              <Button
                className="min-h-11 gap-2"
                disabled={
                  changes.length === 0 || isSaving || needsReconciliation
                }
                onClick={resetChanges}
                type="button"
                variant="outline"
              >
                <RotateCcw aria-hidden className="h-4 w-4" />
                Reset changes
              </Button>
            </>
          ) : null}
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
      {selectedHistory ? (
        <AttendanceHistoryPanel
          attendanceId={selectedHistory.attendanceId}
          childName={selectedHistory.childName}
          key={`${selectedHistory.attendanceId}:${historyVersion}`}
          onClose={() => {
            const trigger = authoritative.rows.find(
              (row) => row.attendanceId === selectedHistory.attendanceId,
            );
            setSelectedHistory(null);
            if (trigger) {
              document
                .getElementById(`attendance-history-${trigger.childId}`)
                ?.focus();
            }
          }}
        />
      ) : null}
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

function hasAppliedRows(
  detail: AdminAttendanceDetail,
  rows: SaveAttendanceRow[],
): boolean {
  const statuses = new Map(
    detail.rows.map((row) => [
      row.childId,
      row.status === "unknown" ? null : API_STATUS[row.status],
    ]),
  );
  return rows.every((row) => statuses.get(row.childId) === row.status);
}
