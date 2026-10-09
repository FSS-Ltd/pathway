"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import type {
  HeadTimetableRoster,
  HeadTimetableSetup,
} from "@/lib/ace-subject-timetable-api";

export function HeadTimetableSelectors({
  setup,
  periodId,
  yearBandId,
  onPeriodChange,
  onYearBandChange,
}: {
  setup: HeadTimetableSetup;
  periodId: string;
  yearBandId: string;
  onPeriodChange: (value: string) => void;
  onYearBandChange: (value: string) => void;
}) {
  const periods = setup.academicYears.flatMap((year) =>
    year.periods.map((period) => ({ ...period, yearName: year.name })),
  );
  return (
    <Card title="Choose a learning group">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-text-primary">
          Academic period
          <select
            value={periodId}
            onChange={(event) => onPeriodChange(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
          >
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.yearName} · {period.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-medium text-text-primary">
          Year band
          <select
            value={yearBandId}
            onChange={(event) => onYearBandChange(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
          >
            {setup.yearBands.map((band) => (
              <option key={band.id} value={band.id}>
                {band.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Card>
  );
}

export function HeadStudentRoster({
  roster,
  selectedChildId,
  loadingMore,
  onSelect,
  onLoadMore,
}: {
  roster: HeadTimetableRoster;
  selectedChildId: string | null;
  loadingMore: boolean;
  onSelect: (childId: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <Card
      title="Student roster"
      description="Select a student to prepare and publish their subject grid."
    >
      {roster.items.length === 0 ? (
        <p className="text-sm text-text-muted">
          No enrolled students in this year band during this period.
        </p>
      ) : (
        <ul className="divide-y divide-border-subtle">
          {roster.items.map((child) => (
            <li key={child.id}>
              <button
                type="button"
                aria-current={selectedChildId === child.id ? "true" : undefined}
                onClick={() => onSelect(child.id)}
                className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg px-2 py-2 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
              >
                <span className="font-medium text-text-primary">
                  {child.firstName} {child.lastName}
                </span>
                <span className="text-xs font-semibold text-text-muted">
                  {child.status === "NOT_STARTED"
                    ? "Not started"
                    : child.status === "PUBLISHED"
                      ? "Published"
                      : "Draft"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {roster.nextCursor ? (
        <Button
          type="button"
          variant="outline"
          disabled={loadingMore}
          onClick={onLoadMore}
          className="mt-4 min-h-11"
        >
          {loadingMore ? "Loading…" : "Load more students"}
        </Button>
      ) : null}
    </Card>
  );
}
