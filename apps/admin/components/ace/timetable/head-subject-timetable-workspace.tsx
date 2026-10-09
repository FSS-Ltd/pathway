"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  fetchHeadTimetableRoster,
  fetchHeadTimetableSchedule,
  fetchHeadTimetableSetup,
  type HeadTimetableRoster,
  type HeadTimetableSetup,
  type TimetableSchedule,
} from "@/lib/ace-subject-timetable-api";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { HeadScheduleEditor } from "./head-schedule-editor";
import { HeadStudentGrid } from "./head-student-grid";
import type { StudentTimetableAction } from "./head-student-publication-actions";
import {
  HeadStudentRoster,
  HeadTimetableSelectors,
} from "./head-timetable-selection";

function HeadTimetableWorkspaceView() {
  const [setup, setSetup] = React.useState<HeadTimetableSetup | null>(null);
  const [periodId, setPeriodId] = React.useState("");
  const [yearBandId, setYearBandId] = React.useState("");
  const [schedule, setSchedule] = React.useState<TimetableSchedule | null>(
    null,
  );
  const [roster, setRoster] = React.useState<HeadTimetableRoster | null>(null);
  const [childId, setChildId] = React.useState<string | null>(null);
  const [loadingSetup, setLoadingSetup] = React.useState(true);
  const [loadingSelection, setLoadingSelection] = React.useState(false);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectionError, setSelectionError] = React.useState<string | null>(
    null,
  );
  const [scheduleSaved, setScheduleSaved] = React.useState(false);
  const [setupRevision, setSetupRevision] = React.useState(0);
  const [selectionRevision, setSelectionRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoadingSetup(true);
    setError(null);
    void fetchHeadTimetableSetup(controller.signal)
      .then((loaded) => {
        setSetup(loaded);
        setPeriodId((current) =>
          loaded.academicYears.some((year) =>
            year.periods.some((period) => period.id === current),
          )
            ? current
            : (loaded.academicYears.flatMap((year) => year.periods)[0]?.id ??
              ""),
        );
        setYearBandId((current) =>
          loaded.yearBands.some((band) => band.id === current)
            ? current
            : (loaded.yearBands[0]?.id ?? ""),
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Timetable setup could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSetup(false);
      });
    return () => controller.abort();
  }, [setupRevision]);

  React.useEffect(() => {
    if (!periodId || !yearBandId) return;
    const controller = new AbortController();
    setLoadingSelection(true);
    setSelectionError(null);
    setSchedule(null);
    setRoster(null);
    setChildId(null);
    setScheduleSaved(false);
    void Promise.all([
      fetchHeadTimetableSchedule(periodId, yearBandId, controller.signal),
      fetchHeadTimetableRoster(
        periodId,
        yearBandId,
        undefined,
        controller.signal,
      ),
    ])
      .then(([loadedSchedule, loadedRoster]) => {
        setSchedule(loadedSchedule.schedule);
        setRoster(loadedRoster);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setSelectionError(
            cause instanceof Error
              ? cause.message
              : "Timetable could not be loaded.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingSelection(false);
      });
    return () => controller.abort();
  }, [periodId, yearBandId, selectionRevision]);

  async function loadMore() {
    if (!roster?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setSelectionError(null);
    try {
      const next = await fetchHeadTimetableRoster(
        periodId,
        yearBandId,
        roster.nextCursor,
      );
      setRoster((current) =>
        current
          ? {
              items: [...current.items, ...next.items],
              nextCursor: next.nextCursor,
            }
          : next,
      );
    } catch (cause: unknown) {
      setSelectionError(
        cause instanceof Error
          ? cause.message
          : "More students could not be loaded.",
      );
    } finally {
      setLoadingMore(false);
    }
  }

  function updateSelectedStudent(action: StudentTimetableAction) {
    setRoster((current) =>
      current
        ? {
            ...current,
            items: current.items.map((item) =>
              item.id === childId
                ? {
                    ...item,
                    status:
                      action === "publish"
                        ? "PUBLISHED"
                        : action === "withdraw"
                          ? "DRAFT"
                          : item.status === "PUBLISHED"
                            ? "PUBLISHED"
                            : "DRAFT",
                  }
                : item,
            ),
          }
        : current,
    );
  }

  const periods =
    setup?.academicYears.flatMap((year) =>
      year.periods.map((period) => ({ ...period, yearName: year.name })),
    ) ?? [];
  const selectedChild = roster?.items.find((child) => child.id === childId);

  return (
    <main className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-semibold text-accent-strong">
          ACE / Academic setup
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary">
          Subject timetable
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Set the year band’s weekly slots, assign each student’s subjects, then
          publish an immutable version for linked families.
        </p>
      </header>

      {loadingSetup ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading academic periods and year bands…
          </p>
        </Card>
      ) : error ? (
        <Card>
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3"
          >
            <p className="text-sm text-status-danger">{error}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSetupRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : !periods.length || !setup?.yearBands.length ? (
        <Card title="Academic setup needed">
          <p className="text-sm text-text-muted">
            Add an academic period and an active year band for this site before
            building a subject timetable.
          </p>
        </Card>
      ) : (
        <>
          <HeadTimetableSelectors
            setup={setup}
            periodId={periodId}
            yearBandId={yearBandId}
            onPeriodChange={setPeriodId}
            onYearBandChange={setYearBandId}
          />
          {loadingSelection ? (
            <Card>
              <p role="status" className="text-sm text-text-muted">
                Loading schedule and student roster…
              </p>
            </Card>
          ) : null}
          {selectionError ? (
            <Card>
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3"
              >
                <p className="text-sm text-status-danger">{selectionError}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelectionRevision((value) => value + 1)}
                >
                  Reload selection
                </Button>
              </div>
            </Card>
          ) : null}
          {!loadingSelection && roster ? (
            <>
              <HeadScheduleEditor
                key={`${periodId}:${yearBandId}:${schedule?.updatedAt ?? "new"}`}
                periodId={periodId}
                yearBandId={yearBandId}
                schedule={schedule}
                onSaved={(value) => {
                  setSchedule(value);
                  setChildId(null);
                  setScheduleSaved(true);
                }}
                onReload={() => setSelectionRevision((value) => value + 1)}
              />
              {scheduleSaved ? (
                <p role="status" className="text-sm text-status-success">
                  Schedule saved for this period and year band.
                </p>
              ) : null}
              <HeadStudentRoster
                roster={roster}
                selectedChildId={childId}
                loadingMore={loadingMore}
                onSelect={setChildId}
                onLoadMore={() => void loadMore()}
              />
              {selectedChild && schedule ? (
                <HeadStudentGrid
                  key={`${periodId}:${yearBandId}:${selectedChild.id}:${schedule.updatedAt}`}
                  periodId={periodId}
                  yearBandId={yearBandId}
                  child={selectedChild}
                  schedule={schedule}
                  onChanged={updateSelectedStudent}
                />
              ) : selectedChild ? (
                <Card title="Create the slot schedule first">
                  <p className="text-sm text-text-muted">
                    Save the teaching days and slots before assigning subjects
                    to this student.
                  </p>
                </Card>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </main>
  );
}

export function HeadSubjectTimetableWorkspace() {
  const [siteRevision, setSiteRevision] = React.useState(0);
  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => setSiteRevision((value) => value + 1)),
    [],
  );
  return <HeadTimetableWorkspaceView key={siteRevision} />;
}
