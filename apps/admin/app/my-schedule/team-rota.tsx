"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import { fetchTeamSchedule, type AdminTeamAssignment } from "@/lib/api-client";
import { toLocalDateKey } from "@/lib/date";
import { requestFailure, type RequestFailure } from "@/lib/request-error";

type TeamRotaState =
  | { scope: string; status: "loading" }
  | { scope: string; status: "error"; error: RequestFailure }
  | { scope: string; status: "ready"; rows: AdminTeamAssignment[] };

function groupByDay(rows: AdminTeamAssignment[]) {
  const days = new Map<string, AdminTeamAssignment[]>();
  for (const row of rows) {
    const day = toLocalDateKey(new Date(row.startsAt));
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  return [...days.entries()];
}

function timeRange(row: AdminTeamAssignment): string {
  const format = (value: string) =>
    new Date(value).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${format(row.startsAt)}–${format(row.endsAt)}`;
}

export function TeamRotaList({ rows }: { rows: AdminTeamAssignment[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        No team sessions are scheduled for this week.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {groupByDay(rows).map(([day, assignments]) => (
        <section key={day} aria-label={`Team sessions on ${day}`}>
          <h4 className="mb-2 text-sm font-semibold text-text-primary">
            {new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </h4>
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-lg border border-border-subtle bg-surface">
            {assignments.map((row) => (
              <li
                key={row.assignmentId}
                className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="font-medium text-text-primary">
                    {row.sessionTitle}
                  </p>
                  <p className="text-sm text-text-muted">
                    {row.groups.map((group) => group.name).join(", ") ||
                      "Site session"}
                    {" · "}
                    {timeRange(row)}
                  </p>
                </div>
                <p className="text-sm text-text-primary sm:text-right">
                  {row.staffName}
                  <span className="block text-xs capitalize text-text-muted">
                    {row.role.toLowerCase().replaceAll("_", " ")} ·{" "}
                    {row.status === "PENDING" ? "Pending" : "Accepted"}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

export function TeamRota({
  siteId,
  dateFrom,
  dateTo,
}: {
  siteId: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const [state, setState] = React.useState<TeamRotaState | null>(null);
  const [revision, setRevision] = React.useState(0);
  const scope = siteId ? `${siteId}:${dateFrom}:${dateTo}` : null;

  React.useEffect(() => {
    if (!scope) return;
    const controller = new AbortController();
    setState({ scope, status: "loading" });
    void fetchTeamSchedule(dateFrom, dateTo, controller.signal)
      .then((rows) => {
        if (!controller.signal.aborted)
          setState({ scope, status: "ready", rows });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            scope,
            status: "error",
            error: requestFailure(error, "Unable to load team rota."),
          });
        }
      });
    return () => controller.abort();
  }, [scope, dateFrom, dateTo, revision]);

  const current = state?.scope === scope ? state : null;
  return (
    <Card
      title="Team rota"
      description="See when your colleagues are scheduled at this site."
      actions={
        current?.status === "error" &&
        current.error.kind === "denied" ? null : (
          <Button asChild variant="secondary" size="sm">
            <Link href="/staff/profile#weekly-availability">
              Set my availability
            </Link>
          </Button>
        )
      }
    >
      {!scope ? (
        <p className="text-sm text-text-muted">
          Choose a site to see the team rota.
        </p>
      ) : !current || current.status === "loading" ? (
        <div role="status" aria-label="Loading team rota" className="space-y-2">
          {[1, 2].map((item) => (
            <div
              key={item}
              className="h-14 rounded-md bg-muted motion-safe:animate-pulse"
            />
          ))}
        </div>
      ) : current.status === "error" ? (
        <div role="alert" className="space-y-2 text-sm text-status-danger">
          <p>
            {current.error.kind === "denied"
              ? "Team rota is available to staff at this site."
              : current.error.message}
          </p>
          {current.error.kind === "unavailable" ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : (
        <TeamRotaList rows={current.rows} />
      )}
    </Card>
  );
}
