"use client";

import React from "react";
import { Button, Card, Input, Label } from "@pathway/ui";
import {
  fetchFamilyDailyAttendance,
  type FamilyAttendanceScope,
  type FamilyDailyAttendanceHistory,
} from "@/lib/family-daily-attendance-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";
import { FamilyAttendanceResults } from "./family-attendance-results";

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function initialDates() {
  return {
    from: new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10),
    to: todayUtc(),
  };
}

function validateDates(from: string, to: string): string | null {
  if (!from || !to || from > to) return "Choose a valid start and end date.";
  if (
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) /
      86_400_000 >=
    366
  ) {
    return "Choose a period of at most 366 days.";
  }
  return null;
}

export function FamilyAttendanceView({
  scope,
  status,
}: {
  scope: FamilyAttendanceScope;
  status: SessionStatus;
}) {
  const [draft, setDraft] = React.useState(initialDates);
  const [dates, setDates] = React.useState(initialDates);
  const [revision, setRevision] = React.useState(0);
  const [validationError, setValidationError] = React.useState<string | null>(
    null,
  );
  const [data, setData] = React.useState<FamilyDailyAttendanceHistory | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    void fetchFamilyDailyAttendance(scope, dates, controller.signal)
      .then((history) => setData(history))
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Attendance could not be loaded. Please try again.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [
    scope.kind,
    scope.siteId,
    scope.kind === "parent" ? scope.childId : null,
    dates,
    revision,
    status,
  ]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = validateDates(draft.from, draft.to);
    setValidationError(message);
    if (!message) {
      setDates({ ...draft });
      setRevision((value) => value + 1);
    }
  }

  const title =
    scope.kind === "student" ? "Your attendance" : "Child attendance";
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent-strong">
          ACE / Attendance
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary">
          {title}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Review recorded daily marks for the selected school site. Days without
          a mark are not counted as absences.
        </p>
      </header>

      <Card
        title="Choose a period"
        description="Review up to one year of recorded days."
      >
        <form
          onSubmit={submit}
          className="flex flex-col gap-4 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <Label htmlFor="family-attendance-from">From</Label>
            <Input
              id="family-attendance-from"
              className="mt-1 min-h-11"
              type="date"
              value={draft.from}
              max={draft.to}
              onChange={(event) =>
                setDraft({ ...draft, from: event.target.value })
              }
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="family-attendance-to">To</Label>
            <Input
              id="family-attendance-to"
              className="mt-1 min-h-11"
              type="date"
              value={draft.to}
              min={draft.from}
              onChange={(event) =>
                setDraft({ ...draft, to: event.target.value })
              }
            />
          </div>
          <Button type="submit" className="min-h-11" disabled={loading}>
            Show attendance
          </Button>
        </form>
        {validationError && (
          <p className="mt-3 text-sm text-status-danger" role="alert">
            {validationError}
          </p>
        )}
      </Card>

      {status === "loading" || (status === "authenticated" && loading) ? (
        <p role="status" className="text-sm text-text-muted">
          Loading attendance…
        </p>
      ) : status !== "authenticated" ? (
        <Card>
          <p className="text-sm text-text-muted">Sign in to view attendance.</p>
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
      ) : data ? (
        <FamilyAttendanceResults data={data} />
      ) : null}
    </main>
  );
}

export function FamilyAttendanceWorkspace({
  scope,
}: {
  scope: FamilyAttendanceScope;
}) {
  const { status } = useSession();
  const scopeKey =
    scope.kind === "student"
      ? `student:${scope.siteId}`
      : `parent:${scope.siteId}:${scope.childId}`;
  return <FamilyAttendanceView key={scopeKey} scope={scope} status={status} />;
}
