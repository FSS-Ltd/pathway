"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card, Select } from "@pathway/ui";
import {
  fetchParentVolunteering,
  saveParentVolunteering,
  type ParentVolunteeringCalendar,
  type VolunteerDay,
} from "@/lib/school-volunteering-api";
import { requestFailure } from "@/lib/request-error";
import { ApiError } from "@/lib/api-transport";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function VolunteerDayChoice({
  day,
  checked,
  pending,
  onChange,
}: {
  day: VolunteerDay;
  checked: boolean;
  pending: boolean;
  onChange: (checked: boolean) => void;
}) {
  const full = day.status === "Full" && !checked;
  return (
    <li>
      <label className="flex min-h-14 cursor-pointer items-center gap-4 rounded-xl border border-border-subtle bg-surface px-4 py-3 transition-colors hover:border-accent-strong focus-within:border-accent-strong focus-within:ring-2 focus-within:ring-accent-strong/30 motion-reduce:transition-none has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-65">
        <input
          type="checkbox"
          checked={checked}
          disabled={full || pending}
          onChange={(event) => onChange(event.target.checked)}
          className="h-5 w-5 shrink-0 accent-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        />
        <span className="min-w-0 flex-1">
          <span className="block font-medium text-text-primary">
            {dayLabel(day.date)}
          </span>
          <span className="block text-sm text-text-muted">
            {checked
              ? "Selected for school support"
              : full
                ? "Full · no spaces left"
                : `${day.spacesLeft} ${day.spacesLeft === 1 ? "space" : "spaces"} left`}
          </span>
        </span>
      </label>
    </li>
  );
}

export function SchoolVolunteeringView({
  siteId,
  status,
}: {
  siteId: string;
  status: SessionStatus;
}) {
  const [calendar, setCalendar] =
    React.useState<ParentVolunteeringCalendar | null>(null);
  const [periodId, setPeriodId] = React.useState<string | null>(null);
  const [chosen, setChosen] = React.useState<Set<string>>(new Set());
  const [loading, setLoading] = React.useState(true);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchParentVolunteering(siteId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setCalendar(data);
        setPeriodId((current) =>
          data.periods.some((item) => item.id === current)
            ? current
            : (data.periods[0]?.id ?? null),
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          const failure = requestFailure(
            cause,
            "School volunteering could not be loaded. Please try again.",
          );
          setError(
            failure.kind === "unavailable"
              ? failure.message
              : "School volunteering is not available for this account.",
          );
          setCalendar(null);
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [siteId, status, revision]);

  const period = calendar?.periods.find((item) => item.id === periodId);
  React.useEffect(() => {
    setChosen(
      new Set(
        period?.days
          .filter((day) => day.status === "Selected")
          .map((day) => day.date) ?? [],
      ),
    );
  }, [period]);

  const savedDates =
    period?.days
      .filter((day) => day.status === "Selected")
      .map((day) => day.date) ?? [];
  const dirty = period
    ? savedDates.length !== chosen.size ||
      savedDates.some((date) => !chosen.has(date))
    : false;

  async function save() {
    if (!period || !dirty) return;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const result = await saveParentVolunteering(
        siteId,
        period.id,
        [...chosen].sort(),
      );
      const refreshed = await fetchParentVolunteering(siteId);
      setCalendar(refreshed);
      setNotice(
        `${result.added} ${result.added === 1 ? "day" : "days"} added, ${result.removed} removed.`,
      );
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          setCalendar(await fetchParentVolunteering(siteId));
          setError(
            "A selected day just filled. Review the updated availability and save again.",
          );
        } catch (refreshError) {
          setError(
            requestFailure(
              refreshError,
              "Availability could not be refreshed. Try again.",
            ).message,
          );
        }
        return;
      }
      const failure = requestFailure(
        cause,
        "Your choices could not be saved. Refresh and try again.",
      );
      setError(failure.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          ‹ Your family
        </Link>
        <p className="text-sm font-medium text-accent-strong">ACE / Family</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Help at school
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Choose days when you can help your school team. Each day has two
          places.
        </p>
      </header>

      {status === "loading" || (status === "authenticated" && loading) ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading school days…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see school support days linked to your family account.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link
              href={`/login?returnTo=${encodeURIComponent(`/ace/parent/sites/${siteId}/volunteering`)}`}
            >
              Sign in
            </Link>
          </Button>
        </Card>
      ) : error && !calendar ? (
        <Card>
          <div role="alert" className="space-y-3">
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
      ) : calendar?.periods.length === 0 ? (
        <Card title="No school days available">
          <p className="text-sm text-text-muted">
            Your school has not opened any upcoming school support days yet.
          </p>
        </Card>
      ) : (
        <Card
          title="Choose your days"
          description="Your changes are saved only when you press Save days."
        >
          <div className="space-y-5">
            <div className="max-w-sm space-y-2">
              <label
                htmlFor="volunteer-period"
                className="block text-sm font-medium text-text-primary"
              >
                School period
              </label>
              <Select
                id="volunteer-period"
                value={periodId ?? ""}
                disabled={pending}
                onChange={(event) => {
                  setNotice(null);
                  setError(null);
                  setPeriodId(event.target.value);
                }}
                className="min-h-11 w-full"
              >
                {calendar?.periods.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </Select>
            </div>
            {period?.days.length ? (
              <ul className="grid gap-2 sm:grid-cols-2">
                {period.days.map((day) => (
                  <VolunteerDayChoice
                    key={day.date}
                    day={day}
                    checked={chosen.has(day.date)}
                    pending={pending}
                    onChange={(checked) =>
                      setChosen((current) => {
                        const next = new Set(current);
                        if (checked) next.add(day.date);
                        else next.delete(day.date);
                        setNotice(null);
                        return next;
                      })
                    }
                  />
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-muted">
                No upcoming open days in this period.
              </p>
            )}
            {error ? (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p role="status" className="text-sm text-status-success">
                {notice}
              </p>
            ) : null}
            <Button
              type="button"
              className="min-h-11"
              disabled={!dirty || pending}
              onClick={() => void save()}
            >
              {pending ? "Saving…" : "Save days"}
            </Button>
          </div>
        </Card>
      )}
    </main>
  );
}

export function SchoolVolunteeringWorkspace({ siteId }: { siteId: string }) {
  const { status } = useSession();
  return <SchoolVolunteeringView siteId={siteId} status={status} />;
}
