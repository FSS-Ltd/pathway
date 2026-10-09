"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilySubjectTimetable,
  fetchFamilySubjectTimetablePeriods,
  type FamilySubjectTimetable,
  type FamilySubjectTimetableList,
} from "@/lib/family-subject-timetable-api";
import type { FamilyTimetableScope } from "@/lib/family-timetable-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";
import { FamilyTimetableNavigation } from "./family-timetable-navigation";
import {
  FamilySubjectTimetableGrid,
  formatTimetableDate,
} from "./family-subject-timetable-grid";

export function FamilySubjectTimetableView({
  scope,
  status,
}: {
  scope: FamilyTimetableScope;
  status: SessionStatus;
}) {
  const [periods, setPeriods] =
    React.useState<FamilySubjectTimetableList | null>(null);
  const [loadedScopeKey, setLoadedScopeKey] = React.useState<string | null>(
    null,
  );
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [timetable, setTimetable] =
    React.useState<FamilySubjectTimetable | null>(null);
  const [loadingPeriods, setLoadingPeriods] = React.useState(true);
  const [loadingTimetable, setLoadingTimetable] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  const scopeKey =
    scope.kind === "parent"
      ? `parent:${scope.siteId}:${scope.childId}`
      : `student:${scope.siteId}`;
  const periodId =
    loadedScopeKey === scopeKey
      ? (selectedId ?? periods?.items[0]?.periodId ?? null)
      : null;

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoadingPeriods(true);
    setError(null);
    setLoadedScopeKey(null);
    setTimetable(null);
    void fetchFamilySubjectTimetablePeriods(scope, controller.signal)
      .then((loaded) => {
        setPeriods(loaded);
        setLoadedScopeKey(scopeKey);
        setSelectedId((current) =>
          loaded.items.some((item) => item.periodId === current)
            ? current
            : (loaded.items[0]?.periodId ?? null),
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setPeriods(null);
          setLoadedScopeKey(null);
          setTimetable(null);
          setError(
            cause instanceof Error
              ? cause.message
              : "Subject timetable could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingPeriods(false);
      });
    return () => controller.abort();
  }, [
    scope.kind,
    scope.siteId,
    scope.kind === "parent" ? scope.childId : null,
    status,
    revision,
    scopeKey,
  ]);

  React.useEffect(() => {
    if (status !== "authenticated" || !periodId || !periods) return;
    const controller = new AbortController();
    setLoadingTimetable(true);
    setTimetable(null);
    setError(null);
    void fetchFamilySubjectTimetable(scope, periodId, controller.signal)
      .then(setTimetable)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Subject timetable could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadingTimetable(false);
      });
    return () => controller.abort();
  }, [
    scope.kind,
    scope.siteId,
    scope.kind === "parent" ? scope.childId : null,
    status,
    periodId,
    periods,
  ]);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Your family
        </Link>
        <p className="text-sm font-medium text-text-muted">
          ACE / Learning week
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {periods
            ? `${periods.childName}’s subject timetable`
            : "Subject timetable"}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          The subjects your school has published for each teaching day.
        </p>
      </header>

      <FamilyTimetableNavigation scope={scope} current="subjects" />

      {status === "loading" ||
      (status === "authenticated" && loadingPeriods) ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading subject timetable…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to view your subject timetable">
          <Button asChild className="mt-2 min-h-11">
            <Link href="/login?returnTo=%2Face%2Ffamily">Sign in</Link>
          </Button>
        </Card>
      ) : error ? (
        <Card>
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <p className="text-sm text-text-primary">{error}</p>
            <Button
              variant="outline"
              type="button"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : periods?.items.length === 0 ? (
        <Card title="No subject timetable published yet">
          <p className="text-sm leading-6 text-text-muted">
            Your school has not published a subject timetable for this student.
            Check back after it is shared.
          </p>
        </Card>
      ) : (
        <>
          <Card>
            <label
              htmlFor="subject-timetable-period"
              className="block text-sm font-semibold text-text-primary"
            >
              Academic period
            </label>
            <select
              id="subject-timetable-period"
              value={periodId ?? ""}
              onChange={(event) => {
                setSelectedId(event.target.value);
              }}
              className="mt-2 min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong sm:max-w-sm"
            >
              {periods?.items.map((period) => (
                <option key={period.periodId} value={period.periodId}>
                  {period.periodName} ·{" "}
                  {formatTimetableDate(period.periodStartsOn)}–
                  {formatTimetableDate(period.periodEndsOn)}
                </option>
              ))}
            </select>
          </Card>

          {loadingTimetable || !timetable ? (
            <Card>
              <p role="status" className="text-sm text-text-muted">
                Loading the published week…
              </p>
            </Card>
          ) : (
            <FamilySubjectTimetableGrid
              key={timetable.publicationId}
              timetable={timetable}
            />
          )}
        </>
      )}
    </main>
  );
}

export function FamilySubjectTimetableWorkspace({
  scope,
}: {
  scope: FamilyTimetableScope;
}) {
  const { status } = useSession();
  const key =
    scope.kind === "parent" ? `${scope.siteId}:${scope.childId}` : scope.siteId;
  return <FamilySubjectTimetableView key={key} scope={scope} status={status} />;
}
