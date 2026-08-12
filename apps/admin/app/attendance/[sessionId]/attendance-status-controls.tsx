"use client";

import React from "react";
import { CheckCircle2, Clock3, XCircle } from "lucide-react";
import { Button, Input } from "@pathway/ui";
import type { AdminAttendanceDetail } from "../../../lib/api-client";

export type AttendanceDisplayStatus =
  AdminAttendanceDetail["rows"][number]["status"];
export type AttendanceMarkStatus = Exclude<AttendanceDisplayStatus, "unknown">;

export const STATUS_LABEL: Record<AttendanceDisplayStatus, string> = {
  present: "Present",
  absent: "Absent",
  late: "Late",
  unknown: "Not marked",
};

const STATUS_OPTIONS: readonly AttendanceMarkStatus[] = [
  "present",
  "absent",
  "late",
];

type AttendanceStatusControlsProps = {
  disabled: boolean;
  onReasonChange: (value: string) => void;
  onSelect: (status: AttendanceMarkStatus) => void;
  reason: string;
  row: AdminAttendanceDetail["rows"][number];
  selected: AttendanceDisplayStatus;
  validation?: string;
};

export function AttendanceStatusControls({
  disabled,
  onReasonChange,
  onSelect,
  reason,
  row,
  selected,
  validation,
}: AttendanceStatusControlsProps) {
  const isChanged = selected !== row.status && selected !== "unknown";
  const needsReason = Boolean(row.attendanceId && isChanged);

  return (
    <div className="space-y-2">
      <div
        aria-label={`Attendance status for ${row.childName}`}
        className="flex flex-wrap gap-2"
        role="radiogroup"
      >
        {STATUS_OPTIONS.map((status) => (
          <Button
            aria-checked={selected === status}
            aria-label={`${row.childName}: ${STATUS_LABEL[status]}`}
            className="min-h-11 gap-2 px-3"
            disabled={disabled}
            id={`attendance-${row.childId}-${status}`}
            key={status}
            onClick={() => onSelect(status)}
            role="radio"
            size="sm"
            type="button"
            variant={selected === status ? "primary" : "outline"}
          >
            <StatusIcon status={status} />
            {STATUS_LABEL[status]}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span
          className="inline-flex items-center gap-1 font-semibold text-text-primary"
          id={`attendance-saved-${row.childId}`}
        >
          <StatusIcon status={row.status} />
          Saved: {STATUS_LABEL[row.status]}
        </span>
        {isChanged ? (
          <span className="text-text-muted">
            Pending: {STATUS_LABEL[selected]}
          </span>
        ) : null}
      </div>
      {needsReason ? (
        <div>
          <label
            className="text-xs font-semibold text-text-primary"
            htmlFor={`attendance-correction-reason-${row.childId}`}
          >
            Reason for changing {row.childName}
          </label>
          <Input
            aria-describedby={
              validation
                ? `attendance-correction-error-${row.childId}`
                : undefined
            }
            aria-invalid={Boolean(validation)}
            className="mt-1 min-h-11"
            disabled={disabled}
            id={`attendance-correction-reason-${row.childId}`}
            onChange={(event) => onReasonChange(event.target.value)}
            required
            value={reason}
          />
          {validation ? (
            <p
              className="mt-1 text-xs text-status-danger"
              id={`attendance-correction-error-${row.childId}`}
            >
              {validation}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: AttendanceDisplayStatus }) {
  const className = "h-4 w-4 shrink-0";
  if (status === "present") {
    return <CheckCircle2 aria-hidden className={className} />;
  }
  if (status === "late") {
    return <Clock3 aria-hidden className={className} />;
  }
  if (status === "absent") {
    return <XCircle aria-hidden className={className} />;
  }
  return (
    <span aria-hidden className="text-xs">
      ?
    </span>
  );
}
