"use client";

import React from "react";
import { Badge, Button, Label, Select, Textarea } from "@pathway/ui";
import {
  saveDailyAttendanceMark,
  type DailyAbsenceReason,
  type DailyAttendanceMarkInput,
  type DailyAttendanceRow,
  type DailyAttendanceStatus,
} from "@/lib/daily-attendance-api";
import {
  dailyAbsenceLabel,
  dailyAbsenceReasons,
  dailyStatusLabel,
} from "./daily-attendance-display";

export function DailyRegisterRow({
  row,
  date,
  canManage,
  canWrite,
  onSaved,
  onHistory,
}: {
  row: DailyAttendanceRow;
  date: string;
  canManage: boolean;
  canWrite: boolean;
  onSaved: () => void;
  onHistory: () => void;
}) {
  const [status, setStatus] = React.useState<DailyAttendanceStatus | "">(
    row.mark?.status ?? "",
  );
  const [absenceReason, setAbsenceReason] = React.useState<
    DailyAbsenceReason | ""
  >(row.mark?.absenceReason ?? "");
  const [correctionReason, setCorrectionReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const successRef = React.useRef<HTMLParagraphElement>(null);
  const controller = React.useRef<AbortController | null>(null);

  React.useEffect(() => () => controller.current?.abort(), []);
  React.useEffect(() => {
    setStatus(row.mark?.status ?? "");
    setAbsenceReason(row.mark?.absenceReason ?? "");
    setCorrectionReason("");
  }, [row.mark?.status, row.mark?.absenceReason]);

  const changed =
    row.mark !== null &&
    (status !== row.mark.status ||
      (status === "ABSENT" ? absenceReason : null) !== row.mark.absenceReason);
  const canSubmit =
    canManage &&
    canWrite &&
    !pending &&
    status !== "" &&
    (status !== "ABSENT" || absenceReason !== "") &&
    (row.mark === null || (changed && correctionReason.trim() !== ""));

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManage || !canWrite || pending) return;
    if (!status) {
      setError("Choose an attendance status.");
      return;
    }
    if (status === "ABSENT" && !absenceReason) {
      setError("Choose an absence reason.");
      return;
    }
    if (row.mark && !changed) return;
    if (row.mark && !correctionReason.trim()) {
      setError("Explain why this saved mark is changing.");
      return;
    }

    const input: DailyAttendanceMarkInput = {
      status,
      ...(status === "ABSENT" && absenceReason ? { absenceReason } : {}),
      ...(row.mark ? { correctionReason: correctionReason.trim() } : {}),
    };
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    setError(null);
    setSuccess(null);
    try {
      await saveDailyAttendanceMark(date, row.childId, input, request.signal);
      if (request.signal.aborted) return;
      setCorrectionReason("");
      setSuccess(row.mark ? "Correction saved." : "Attendance saved.");
      onSaved();
      requestAnimationFrame(() => successRef.current?.focus());
    } catch (cause) {
      if (!request.signal.aborted) {
        setError(
          cause instanceof Error ? cause.message : "Unable to save this mark.",
        );
      }
    } finally {
      if (!request.signal.aborted) setPending(false);
      if (controller.current === request) controller.current = null;
    }
  }

  return (
    <li className="rounded-2xl border border-border-subtle bg-surface px-4 py-4 shadow-sm sm:px-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-text-primary">{row.displayName}</p>
          <p className="mt-1 text-sm text-text-muted">
            {row.band.name} · {row.academicYear}
          </p>
        </div>
        <Badge variant={row.mark ? "accent" : "default"}>
          {row.mark ? dailyStatusLabel[row.mark.status] : "Unmarked"}
        </Badge>
      </div>

      {row.mark ? (
        <p className="mt-3 text-sm text-text-muted">
          {row.mark.absenceReason
            ? `${dailyAbsenceLabel[row.mark.absenceReason]} · `
            : ""}
          Recorded by {row.mark.recordedBy}
        </p>
      ) : null}

      {canManage && canWrite ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => void handleSubmit(event)}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`daily-status-${row.childId}`}>Attendance</Label>
              <Select
                className="mt-1 min-h-11"
                id={`daily-status-${row.childId}`}
                disabled={pending}
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value as DailyAttendanceStatus | "");
                  setError(null);
                  setSuccess(null);
                }}
              >
                <option value="">Choose status</option>
                {Object.entries(dailyStatusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </div>
            {status === "ABSENT" ? (
              <div>
                <Label htmlFor={`daily-reason-${row.childId}`}>
                  Absence reason
                </Label>
                <Select
                  className="mt-1 min-h-11"
                  id={`daily-reason-${row.childId}`}
                  disabled={pending}
                  value={absenceReason}
                  onChange={(event) => {
                    setAbsenceReason(
                      event.target.value as DailyAbsenceReason | "",
                    );
                    setError(null);
                    setSuccess(null);
                  }}
                >
                  <option value="">Choose reason</option>
                  {dailyAbsenceReasons.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </div>
          {changed ? (
            <div>
              <Label htmlFor={`daily-correction-${row.childId}`}>
                Correction explanation
              </Label>
              <Textarea
                className="mt-1"
                id={`daily-correction-${row.childId}`}
                disabled={pending}
                maxLength={1000}
                value={correctionReason}
                onChange={(event) => {
                  setCorrectionReason(event.target.value);
                  setError(null);
                  setSuccess(null);
                }}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <Button className="min-h-11" disabled={!canSubmit} type="submit">
              {pending ? "Saving…" : row.mark ? "Save correction" : "Save mark"}
            </Button>
            {error ? (
              <p className="text-sm text-status-danger" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p
                className="text-sm text-status-success outline-none"
                ref={successRef}
                role="status"
                tabIndex={-1}
              >
                {success}
              </p>
            ) : null}
          </div>
        </form>
      ) : null}

      {row.mark ? (
        <Button
          className="mt-3 min-h-11"
          onClick={onHistory}
          type="button"
          variant="secondary"
        >
          View corrections for {row.displayName}
        </Button>
      ) : null}
    </li>
  );
}
