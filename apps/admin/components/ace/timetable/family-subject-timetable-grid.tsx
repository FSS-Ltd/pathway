"use client";

import React from "react";
import { Card } from "@pathway/ui";
import type { FamilySubjectTimetable } from "@/lib/family-subject-timetable-api";

const DAYS = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
] as const;

export function formatTimetableDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function timeLabel(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function SubjectDay({
  day,
  entries,
  visible,
}: {
  day: string;
  entries: FamilySubjectTimetable["entries"];
  visible: boolean;
}) {
  return (
    <section
      aria-label={day}
      className={`${visible ? "block" : "hidden"} min-w-0 space-y-3 lg:block lg:min-w-44 lg:flex-1`}
    >
      <h3 className="font-heading text-lg font-semibold capitalize text-text-primary">
        {day.toLowerCase()}
      </h3>
      <ol className="space-y-2">
        {entries.map((entry) => (
          <li
            key={`${entry.day}:${entry.slotPosition}`}
            className={`rounded-xl border px-4 py-3 ${entry.slotKind === "BREAK" ? "border-border-subtle bg-muted" : "border-border-subtle bg-surface shadow-card"}`}
          >
            <span className="block text-xs font-semibold tabular-nums text-accent-strong">
              {timeLabel(entry.startMinutes)}–{timeLabel(entry.endMinutes)}
            </span>
            <span className="mt-1 block text-sm font-semibold text-text-primary">
              {entry.slotKind === "BREAK"
                ? entry.slotLabel
                : entry.subjectName || "Unassigned lesson"}
            </span>
            {entry.slotKind === "LESSON" && entry.subjectName ? (
              <span className="mt-0.5 block text-xs text-text-muted">
                {entry.slotLabel}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function FamilySubjectTimetableGrid({
  timetable,
}: {
  timetable: FamilySubjectTimetable;
}) {
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);
  const days = DAYS.filter((day) =>
    timetable.entries.some((entry) => entry.day === day),
  );
  const activeDay =
    selectedDay && days.some((day) => day === selectedDay)
      ? selectedDay
      : days[0];

  return (
    <section aria-label="Published subject timetable" className="space-y-5">
      <div className="rounded-xl border border-border-subtle bg-surface px-5 py-4">
        <h2 className="font-heading text-xl font-semibold text-text-primary">
          {timetable.periodName} · {timetable.yearBandName}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          {formatTimetableDate(timetable.periodStartsOn)}–
          {formatTimetableDate(timetable.periodEndsOn)} · Published{" "}
          {formatTimetableDate(timetable.publishedAt)}
        </p>
      </div>
      {days.length === 0 ? (
        <Card title="No teaching days in this publication">
          <p className="text-sm text-text-muted">
            Ask your school to review the published timetable.
          </p>
        </Card>
      ) : (
        <>
          <div
            className="flex flex-wrap gap-2 lg:hidden"
            aria-label="Choose teaching day"
          >
            {days.map((day) => (
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
          <div className="lg:flex lg:gap-3 lg:overflow-x-auto">
            {days.map((day) => (
              <SubjectDay
                key={day}
                day={day}
                visible={day === activeDay}
                entries={timetable.entries.filter((entry) => entry.day === day)}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
