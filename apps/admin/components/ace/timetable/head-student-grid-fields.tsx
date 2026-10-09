"use client";

import React from "react";
import type {
  HeadTimetableDraft,
  TimetableDay,
  TimetableSchedule,
  TimetableSlot,
} from "@/lib/ace-subject-timetable-api";

type Entry = NonNullable<HeadTimetableDraft["draft"]>["entries"][number];

function timeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function StudentCell({
  day,
  slot,
  subjectId,
  subjects,
  disabled,
  onChange,
}: {
  day: TimetableDay;
  slot: TimetableSlot;
  subjectId: string;
  subjects: HeadTimetableDraft["eligibleSubjects"];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  if (slot.kind === "BREAK") {
    return <span className="text-sm text-text-muted">Break</span>;
  }
  return (
    <select
      aria-label={`${day.toLowerCase()} ${slot.label} subject`}
      value={subjectId}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 w-full min-w-36 rounded-lg border border-border-subtle bg-surface px-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
    >
      <option value="">Unassigned</option>
      {subjects.map((subject) => (
        <option key={subject.id} value={subject.id}>
          {subject.name}
        </option>
      ))}
    </select>
  );
}

export function HeadStudentGridFields({
  schedule,
  entries,
  subjects,
  disabled,
  onChange,
}: {
  schedule: TimetableSchedule;
  entries: Entry[];
  subjects: HeadTimetableDraft["eligibleSubjects"];
  disabled: boolean;
  onChange: (day: TimetableDay, slotId: string, subjectId: string) => void;
}) {
  const [selectedDay, setSelectedDay] = React.useState<TimetableDay | null>(
    null,
  );
  const activeDay =
    selectedDay && schedule.teachingDays.includes(selectedDay)
      ? selectedDay
      : schedule.teachingDays[0];
  const subjectAt = (day: TimetableDay, slotId: string) =>
    entries.find((entry) => entry.day === day && entry.slotId === slotId)
      ?.subjectId ?? "";

  return (
    <>
      <div
        className="flex flex-wrap gap-2 lg:hidden"
        aria-label="Choose teaching day"
      >
        {schedule.teachingDays.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={day === activeDay}
            onClick={() => setSelectedDay(day)}
            className={`min-h-11 rounded-full border px-4 text-sm font-semibold capitalize focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong ${day === activeDay ? "border-accent-strong bg-accent-subtle text-text-primary" : "border-border-subtle bg-surface text-text-primary"}`}
          >
            {day.toLowerCase()}
          </button>
        ))}
      </div>
      <div className="space-y-3 lg:hidden">
        {schedule.slots.map((slot) => (
          <div
            key={slot.id}
            className="space-y-2 rounded-xl border border-border-subtle bg-surface p-4"
          >
            <p className="text-sm font-semibold text-text-primary">
              {slot.label}{" "}
              <span className="font-normal text-text-muted">
                {timeLabel(slot.startMinutes)}–{timeLabel(slot.endMinutes)}
              </span>
            </p>
            <StudentCell
              day={activeDay}
              slot={slot}
              subjectId={subjectAt(activeDay, slot.id)}
              subjects={subjects}
              disabled={disabled}
              onChange={(value) => onChange(activeDay, slot.id, value)}
            />
          </div>
        ))}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-border-subtle lg:block">
        <table className="w-full min-w-[48rem] border-collapse text-left">
          <thead className="bg-muted text-sm text-text-primary">
            <tr>
              <th scope="col" className="px-3 py-3">
                Time
              </th>
              {schedule.teachingDays.map((day) => (
                <th key={day} scope="col" className="px-3 py-3 capitalize">
                  {day.toLowerCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {schedule.slots.map((slot) => (
              <tr
                key={slot.id}
                className="border-t border-border-subtle align-top"
              >
                <th
                  scope="row"
                  className="px-3 py-3 text-sm font-semibold text-text-primary"
                >
                  {slot.label}
                  <span className="mt-1 block whitespace-nowrap text-xs font-normal tabular-nums text-text-muted">
                    {timeLabel(slot.startMinutes)}–{timeLabel(slot.endMinutes)}
                  </span>
                </th>
                {schedule.teachingDays.map((day) => (
                  <td key={day} className="px-3 py-3">
                    <StudentCell
                      day={day}
                      slot={slot}
                      subjectId={subjectAt(day, slot.id)}
                      subjects={subjects}
                      disabled={disabled}
                      onChange={(value) => onChange(day, slot.id, value)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
