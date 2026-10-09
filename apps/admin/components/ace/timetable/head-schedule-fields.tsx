"use client";

import React from "react";
import { Button } from "@pathway/ui";
import type { TimetableDay } from "@/lib/ace-subject-timetable-api";

export const TIMETABLE_DAYS: TimetableDay[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];

export interface SlotForm {
  id?: string;
  kind: "LESSON" | "BREAK";
  label: string;
  start: string;
  end: string;
}

export function HeadScheduleFields({
  days,
  slots,
  pending,
  onDaysChange,
  onSlotChange,
  onRemoveSlot,
  onAddSlot,
}: {
  days: TimetableDay[];
  slots: SlotForm[];
  pending: boolean;
  onDaysChange: (days: TimetableDay[]) => void;
  onSlotChange: (index: number, change: Partial<SlotForm>) => void;
  onRemoveSlot: (index: number) => void;
  onAddSlot: () => void;
}) {
  return (
    <>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold text-text-primary">
          Teaching days
        </legend>
        <div className="flex flex-wrap gap-2">
          {TIMETABLE_DAYS.map((day) => (
            <label
              key={day}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary"
            >
              <input
                type="checkbox"
                checked={days.includes(day)}
                disabled={pending}
                onChange={(event) =>
                  onDaysChange(
                    event.target.checked
                      ? [...days, day]
                      : days.filter((value) => value !== day),
                  )
                }
                className="accent-accent-strong"
              />
              <span className="capitalize">{day.toLowerCase()}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-text-primary">
          Ordered slots
        </legend>
        {slots.map((slot, index) => (
          <div
            key={slot.id ?? `new-${index}`}
            className="grid gap-3 rounded-xl border border-border-subtle bg-muted/40 p-4 sm:grid-cols-[7rem_minmax(0,1fr)_7rem_7rem_auto] sm:items-end"
          >
            <label className="text-xs font-medium text-text-muted">
              Type
              <select
                value={slot.kind}
                disabled={pending}
                onChange={(event) =>
                  onSlotChange(index, {
                    kind: event.target.value as SlotForm["kind"],
                  })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-2 text-sm text-text-primary"
              >
                <option value="LESSON">Lesson</option>
                <option value="BREAK">Break</option>
              </select>
            </label>
            <label className="text-xs font-medium text-text-muted">
              Label
              <input
                value={slot.label}
                maxLength={50}
                disabled={pending}
                onChange={(event) =>
                  onSlotChange(index, { label: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary"
              />
            </label>
            <label className="text-xs font-medium text-text-muted">
              Start
              <input
                type="time"
                value={slot.start}
                disabled={pending}
                onChange={(event) =>
                  onSlotChange(index, { start: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-2 text-sm text-text-primary"
              />
            </label>
            <label className="text-xs font-medium text-text-muted">
              End
              <input
                type="time"
                value={slot.end}
                disabled={pending}
                onChange={(event) =>
                  onSlotChange(index, { end: event.target.value })
                }
                className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-2 text-sm text-text-primary"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              disabled={pending || slots.length === 1}
              onClick={() => onRemoveSlot(index)}
              className="min-h-11"
            >
              Remove
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          disabled={pending || slots.length >= 16}
          onClick={onAddSlot}
        >
          Add slot
        </Button>
      </fieldset>
    </>
  );
}
