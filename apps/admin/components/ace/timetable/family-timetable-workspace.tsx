"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilyTimetable,
  type FamilyTimetable,
  type FamilyTimetableScope,
} from "@/lib/family-timetable-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";
import { FamilyTimetableNavigation } from "./family-timetable-navigation";

const WEEK_MS = 7 * 86_400_000;

function startOfWeek(date: Date): Date {
  const day = date.getUTCDay();
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((day + 6) % 7),
    ),
  );
}

function weekLabel(start: Date): string {
  const end = new Date(start.getTime() + WEEK_MS - 86_400_000);
  const format = (date: Date) =>
    date.toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  return `${format(start)} – ${format(end)}`;
}

function formatSession(date: string, timeZone: string | undefined): string {
  return new Date(date).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  });
}

function sessionDay(date: string, timeZone: string | undefined): string {
  return new Date(date).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(timeZone ? { timeZone } : {}),
  });
}

export function FamilyTimetableView({
  scope,
  status,
}: {
  scope: FamilyTimetableScope;
  status: SessionStatus;
}) {
  const [week, setWeek] = React.useState(() => startOfWeek(new Date()));
  const [revision, setRevision] = React.useState(0);
  const [data, setData] = React.useState<FamilyTimetable | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    void fetchFamilyTimetable(
      scope,
      week,
      new Date(week.getTime() + WEEK_MS),
      controller.signal,
    )
      .then(setData)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Timetable could not be loaded. Please try again.",
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    scope.kind,
    scope.siteId,
    scope.kind === "parent" ? scope.childId : null,
    week,
    revision,
    status,
  ]);

  const timeZone = data?.timezone ?? undefined;
  const days = React.useMemo(() => {
    const grouped = new Map<string, FamilyTimetable["items"]>();
    for (const item of data?.items ?? []) {
      const label = sessionDay(item.startsAt, timeZone);
      grouped.set(label, [...(grouped.get(label) ?? []), item]);
    }
    return [...grouped.entries()];
  }, [data, timeZone]);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Your family
        </Link>
        <p className="text-sm font-medium text-accent-strong">ACE / Sessions</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {data ? `${data.childName}’s sessions` : "Sessions"}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Published school sessions for this week. Your school will share
          updates here after publishing them.
        </p>
      </header>

      <FamilyTimetableNavigation scope={scope} current="sessions" />

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-semibold text-text-primary">
            {weekLabel(week)}
          </h2>
          <div className="flex items-center gap-2" aria-label="Choose week">
            <Button
              variant="outline"
              type="button"
              className="min-h-11"
              onClick={() => setWeek(new Date(week.getTime() - WEEK_MS))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />{" "}
              Previous
            </Button>
            <Button
              variant="outline"
              type="button"
              className="min-h-11"
              onClick={() => setWeek(startOfWeek(new Date()))}
              disabled={week.getTime() === startOfWeek(new Date()).getTime()}
            >
              This week
            </Button>
            <Button
              variant="outline"
              type="button"
              className="min-h-11"
              onClick={() => setWeek(new Date(week.getTime() + WEEK_MS))}
            >
              Next <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>

      {status === "loading" || (status === "authenticated" && loading) ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading timetable…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to view your timetable">
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
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : days.length === 0 ? (
        <Card title="No published sessions this week">
          <p className="text-sm leading-6 text-text-muted">
            Your school has not published a timetable for this week. You can
            check another week or come back later.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map(([day, items]) => (
            <section key={day} aria-label={day} className="space-y-2">
              <h2 className="font-heading text-lg font-semibold text-text-primary">
                {day}
              </h2>
              <ul className="overflow-hidden rounded-xl border border-border-subtle bg-surface shadow-card">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 border-b border-border-subtle px-5 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-6"
                  >
                    <span className="shrink-0 text-sm font-semibold tabular-nums text-accent-strong">
                      {formatSession(item.startsAt, timeZone)} –{" "}
                      {formatSession(item.endsAt, timeZone)}
                    </span>
                    <span className="font-medium text-text-primary">
                      {item.title || "Learning session"}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}

export function FamilyTimetableWorkspace({
  scope,
}: {
  scope: FamilyTimetableScope;
}) {
  const { status } = useSession();
  const key =
    scope.kind === "parent" ? `${scope.siteId}:${scope.childId}` : scope.siteId;
  return <FamilyTimetableView key={key} scope={scope} status={status} />;
}
