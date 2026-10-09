"use client";

import * as React from "react";
import { Button, Input, Label } from "@pathway/ui";
import { Plus, Trash2 } from "lucide-react";
import type { StaffUnavailableWindow } from "@/lib/api-client";
import { toLocalDateKey } from "@/lib/date";
import { Checkbox } from "@/components/ui/checkbox";

type Props = {
  value: StaffUnavailableWindow[];
  onChange: (windows: StaffUnavailableWindow[]) => void;
  disabled?: boolean;
};

function minutes(time: string): number {
  const [hours, mins] = time.split(":").map(Number);
  return hours * 60 + mins;
}

function timeLabel(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function UnavailableWindowEditor({
  value,
  onChange,
  disabled = false,
}: Props) {
  const [month, setMonth] = React.useState(() =>
    toLocalDateKey(new Date()).slice(0, 7),
  );
  const [date, setDate] = React.useState("");
  const [allDay, setAllDay] = React.useState(true);
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("17:00");
  const [error, setError] = React.useState<string | null>(null);
  const lastDay = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5, 7)),
    0,
  ).getDate();
  const monthRows = value
    .map((window, index) => ({ window, index }))
    .filter(({ window }) => window.date.startsWith(`${month}-`))
    .sort(
      (a, b) =>
        a.window.date.localeCompare(b.window.date) ||
        a.window.startMinute - b.window.startMinute,
    );

  function addWindow() {
    const startMinute = allDay ? 0 : minutes(startTime);
    const endMinute = allDay ? 1440 : minutes(endTime);
    if (!date || !date.startsWith(`${month}-`)) {
      setError("Choose a date in the selected month.");
      return;
    }
    if (
      !Number.isFinite(startMinute) ||
      !Number.isFinite(endMinute) ||
      startMinute < 0 ||
      endMinute > 1440 ||
      startMinute >= endMinute
    ) {
      setError("Choose an end time after the start time.");
      return;
    }
    if (
      value.some(
        (window) =>
          window.date === date &&
          startMinute < window.endMinute &&
          endMinute > window.startMinute,
      )
    ) {
      setError("This time overlaps an existing unavailable period.");
      return;
    }
    onChange([...value, { date, startMinute, endMinute }]);
    setDate("");
    setError(null);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-muted">
        Mark a whole day or the hours you cannot cover. Changes save with the
        profile.
      </p>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <Label htmlFor="unavailable-month">Month</Label>
          <Input
            id="unavailable-month"
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
              setDate("");
              setError(null);
            }}
            className="mt-1"
            disabled={disabled}
          />
        </div>
        <div>
          <Label htmlFor="unavailable-date">Date</Label>
          <Input
            id="unavailable-date"
            type="date"
            min={`${month}-01`}
            max={`${month}-${String(lastDay).padStart(2, "0")}`}
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setError(null);
            }}
            className="mt-1"
            disabled={disabled}
          />
        </div>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-text-primary">
        <Checkbox
          checked={allDay}
          onChange={(event) => setAllDay(event.target.checked)}
          disabled={disabled}
        />
        Unavailable all day
      </label>
      {!allDay && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="unavailable-start">From</Label>
            <Input
              id="unavailable-start"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
              className="mt-1"
              disabled={disabled}
            />
          </div>
          <div>
            <Label htmlFor="unavailable-end">Until</Label>
            <Input
              id="unavailable-end"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
              className="mt-1"
              disabled={disabled}
            />
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={addWindow}
        disabled={disabled || !month}
      >
        <Plus className="mr-2 size-4" aria-hidden="true" />
        Add unavailable time
      </Button>
      {monthRows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-subtle px-4 py-5 text-sm text-text-muted">
          No unavailable time recorded for this month.
        </p>
      ) : (
        <ul
          className="space-y-2"
          aria-label="Unavailable times in selected month"
        >
          {monthRows.map(({ window, index }) => (
            <li
              key={`${window.date}-${window.startMinute}-${window.endMinute}`}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm"
            >
              <span className="font-medium text-text-primary">
                {window.date} ·{" "}
                {window.startMinute === 0 && window.endMinute === 1440
                  ? "All day"
                  : `${timeLabel(window.startMinute)}–${timeLabel(window.endMinute)}`}
              </span>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() =>
                  onChange(value.filter((_, rowIndex) => rowIndex !== index))
                }
                disabled={disabled}
                aria-label={`Remove unavailable time on ${window.date} from ${timeLabel(window.startMinute)} to ${timeLabel(window.endMinute)}`}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
