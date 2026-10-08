"use client";

import React from "react";
import { Button, Card, Input, Label } from "@pathway/ui";
import { fetchDailyAttendanceCsv } from "@/lib/daily-attendance-api";

function rangeError(from: string, to: string): string | null {
  const parse = (value: string) => {
    const timestamp = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(timestamp) &&
      new Date(timestamp).toISOString().slice(0, 10) === value
      ? timestamp
      : null;
  };
  const start = parse(from);
  const end = parse(to);
  if (start === null || end === null) return "Choose both export dates.";
  const days = (end - start) / 86_400_000 + 1;
  if (days < 1) return "The end date must be on or after the start date.";
  if (days > 31) return "Choose a range of 31 days or fewer.";
  return null;
}

export function DailyRegisterExport({ date }: { date: string }) {
  const [from, setFrom] = React.useState(date);
  const [to, setTo] = React.useState(date);
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const request = React.useRef<AbortController | null>(null);
  const error = rangeError(from, to);

  React.useEffect(() => () => request.current?.abort(), []);

  async function download() {
    if (pending || error) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setFeedback(null);
    try {
      const blob = await fetchDailyAttendanceCsv(
        { from, to },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexsteps-ace-attendance-${from}-${to}.csv`;
      try {
        document.body.append(link);
        link.click();
      } finally {
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 0);
      }
      setFeedback({ kind: "success", message: "CSV download started." });
    } catch (cause: unknown) {
      if (!controller.signal.aborted) {
        setFeedback({
          kind: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Daily attendance could not be exported. Please try again.",
        });
      }
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) setPending(false);
    }
  }

  return (
    <Card
      title="Export attendance"
      description="Download marked attendance for this site and your permitted year bands. The register filter above does not change the export."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Label htmlFor="daily-export-from">From</Label>
          <Input
            className="mt-1 min-h-11"
            disabled={pending}
            id="daily-export-from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setFeedback(null);
            }}
          />
        </div>
        <div className="min-w-0 flex-1">
          <Label htmlFor="daily-export-to">To</Label>
          <Input
            className="mt-1 min-h-11"
            disabled={pending}
            id="daily-export-to"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setFeedback(null);
            }}
          />
        </div>
        <Button
          className="min-h-11 shrink-0"
          disabled={pending || Boolean(error)}
          onClick={() => void download()}
          type="button"
          variant="secondary"
        >
          {pending ? "Preparing CSV…" : "Download CSV"}
        </Button>
      </div>
      {error ? (
        <p className="mt-3 text-sm text-status-danger" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p
          className={`mt-3 text-sm ${feedback.kind === "error" ? "text-status-danger" : "text-status-success"}`}
          role={feedback.kind === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      ) : null}
    </Card>
  );
}
