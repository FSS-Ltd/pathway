"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  HeadTimetableRequestError,
  saveHeadTimetableSchedule,
  type TimetableDay,
  type TimetableSchedule,
} from "@/lib/ace-subject-timetable-api";
import {
  HeadScheduleFields,
  TIMETABLE_DAYS,
  type SlotForm,
} from "./head-schedule-fields";

function timeValue(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function minutesValue(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function nextSlotEnd(start: string): string {
  return timeValue(Math.min(minutesValue(start) + 60, 23 * 60 + 59));
}

function initialSlots(schedule: TimetableSchedule | null): SlotForm[] {
  return schedule
    ? schedule.slots.map((slot) => ({
        id: slot.id,
        kind: slot.kind,
        label: slot.label,
        start: timeValue(slot.startMinutes),
        end: timeValue(slot.endMinutes),
      }))
    : [
        {
          kind: "LESSON",
          label: "Morning lesson",
          start: "09:00",
          end: "10:00",
        },
      ];
}

export function HeadScheduleEditor({
  periodId,
  yearBandId,
  schedule,
  onSaved,
  onReload,
}: {
  periodId: string;
  yearBandId: string;
  schedule: TimetableSchedule | null;
  onSaved: (schedule: TimetableSchedule) => void;
  onReload: () => void;
}) {
  const [days, setDays] = React.useState<TimetableDay[]>(
    schedule?.teachingDays ?? ["TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  );
  const [slots, setSlots] = React.useState<SlotForm[]>(() =>
    initialSlots(schedule),
  );
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState(false);
  const [success, setSuccess] = React.useState(false);

  function updateSlot(index: number, change: Partial<SlotForm>) {
    setSlots((current) =>
      current.map((slot, position) =>
        position === index ? { ...slot, ...change } : slot,
      ),
    );
    setSuccess(false);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setConflict(false);
    if (!days.length || !slots.length || !reason.trim()) {
      setError(
        "Choose teaching days and slots, then enter a reason for the change.",
      );
      return;
    }
    if (slots.some((slot) => !slot.label.trim() || !slot.start || !slot.end)) {
      setError("Give every slot a label, start time, and end time.");
      return;
    }
    setPending(true);
    try {
      const saved = await saveHeadTimetableSchedule(periodId, yearBandId, {
        expectedUpdatedAt: schedule?.updatedAt ?? null,
        teachingDays: TIMETABLE_DAYS.filter((day) => days.includes(day)),
        slots: slots.map((slot) => ({
          ...(slot.id ? { id: slot.id } : {}),
          kind: slot.kind,
          label: slot.label.trim(),
          startMinutes: minutesValue(slot.start),
          endMinutes: minutesValue(slot.end),
        })),
        reason: reason.trim(),
      });
      onSaved(saved);
      setReason("");
      setSuccess(true);
    } catch (cause: unknown) {
      setConflict(
        cause instanceof HeadTimetableRequestError && cause.status === 409,
      );
      setError(
        cause instanceof Error ? cause.message : "Schedule could not be saved.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="Weekly slot schedule"
      description="Choose the teaching days and the shared lesson and break times for this year band."
    >
      <form onSubmit={(event) => void save(event)} className="space-y-6">
        <HeadScheduleFields
          days={days}
          slots={slots}
          pending={pending}
          onDaysChange={(value) => {
            setDays(value);
            setSuccess(false);
          }}
          onSlotChange={updateSlot}
          onRemoveSlot={(index) =>
            setSlots((current) =>
              current.filter((_, position) => position !== index),
            )
          }
          onAddSlot={() =>
            setSlots((current) => {
              const start = current.at(-1)?.end ?? "09:00";
              return [
                ...current,
                {
                  kind: "LESSON",
                  label: "",
                  start,
                  end: nextSlotEnd(start),
                },
              ];
            })
          }
        />

        <label className="block text-sm font-medium text-text-primary">
          Reason for saving
          <input
            id="schedule-reason"
            value={reason}
            maxLength={1000}
            disabled={pending}
            onChange={(event) => setReason(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary"
          />
        </label>
        <div aria-live="polite" className="space-y-2">
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          {success ? (
            <p role="status" className="text-sm text-status-success">
              Schedule saved.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending} className="min-h-11">
            {pending ? "Saving…" : "Save schedule"}
          </Button>
          {conflict ? (
            <Button
              type="button"
              variant="outline"
              onClick={onReload}
              className="min-h-11"
            >
              Reload latest schedule
            </Button>
          ) : null}
        </div>
      </form>
    </Card>
  );
}
