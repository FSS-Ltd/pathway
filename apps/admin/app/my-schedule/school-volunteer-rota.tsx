"use client";

import * as React from "react";
import { Button, Card } from "@pathway/ui";
import {
  cancelStaffVolunteer,
  fetchStaffVolunteering,
  type StaffVolunteeringRota,
} from "@/lib/school-volunteering-api";
import { requestFailure, type RequestFailure } from "@/lib/request-error";

type RotaState =
  | { scope: string; status: "loading" }
  | { scope: string; status: "error"; error: RequestFailure }
  | { scope: string; status: "ready"; data: StaffVolunteeringRota };

function dayLabel(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export function SchoolVolunteerRota({
  siteId,
  dateFrom,
  dateTo,
}: {
  siteId: string | null;
  dateFrom: string;
  dateTo: string;
}) {
  const [state, setState] = React.useState<RotaState | null>(null);
  const [revision, setRevision] = React.useState(0);
  const [cancelId, setCancelId] = React.useState<string | null>(null);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const scope = siteId ? `${siteId}:${dateFrom}:${dateTo}` : null;

  React.useEffect(() => {
    if (!siteId || !scope) return;
    const controller = new AbortController();
    setState({ scope, status: "loading" });
    setCancelId(null);
    setReason("");
    setActionError(null);
    void fetchStaffVolunteering(siteId, dateFrom, dateTo, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ scope, status: "ready", data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            scope,
            status: "error",
            error: requestFailure(
              cause,
              "School volunteer rota could not be loaded.",
            ),
          });
        }
      });
    return () => controller.abort();
  }, [siteId, scope, dateFrom, dateTo, revision]);

  const current = state?.scope === scope ? state : null;

  async function cancel() {
    if (!siteId || !cancelId || reason.trim().length < 3) return;
    setPending(true);
    setActionError(null);
    try {
      await cancelStaffVolunteer(siteId, cancelId, reason.trim());
      setCancelId(null);
      setReason("");
      setRevision((value) => value + 1);
    } catch (cause) {
      setActionError(
        requestFailure(cause, "The placement could not be cancelled.").message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <Card
      title="School support volunteers"
      description="Parents helping at this site on open school days."
    >
      {!scope ? (
        <p className="text-sm text-text-muted">
          Choose a site to see school support volunteers.
        </p>
      ) : !current || current.status === "loading" ? (
        <p role="status" className="text-sm text-text-muted">
          Loading school support volunteers…
        </p>
      ) : current.status === "error" ? (
        <div role="alert" className="space-y-3 text-sm">
          <p className="text-status-danger">
            {current.error.kind === "denied"
              ? "This rota is available to staff at this site."
              : current.error.message}
          </p>
          {current.error.kind === "unavailable" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : current.data.days.length === 0 ? (
        <p className="text-sm text-text-muted">
          No open school support days in this week.
        </p>
      ) : (
        <div className="space-y-4">
          {actionError ? (
            <p role="alert" className="text-sm text-status-danger">
              {actionError}
            </p>
          ) : null}
          <ul className="divide-y divide-border-subtle overflow-hidden rounded-xl border border-border-subtle bg-surface">
            {current.data.days.map((day) => (
              <li
                key={day.date}
                className="px-4 py-3 sm:flex sm:justify-between sm:gap-5"
              >
                <div className="mb-2 sm:mb-0">
                  <p className="font-medium text-text-primary">
                    {dayLabel(day.date)}
                  </p>
                  <p className="text-sm text-text-muted">
                    {day.volunteers.length} of {current.data.capacity} places
                    filled
                  </p>
                </div>
                <ul className="space-y-2 sm:text-right">
                  {day.volunteers.length === 0 ? (
                    <li className="text-sm text-text-muted">
                      No volunteers yet
                    </li>
                  ) : null}
                  {day.volunteers.map((volunteer) => (
                    <li
                      key={volunteer.id}
                      className="text-sm text-text-primary"
                    >
                      <span>{volunteer.name}</span>
                      {current.data.canManage ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="ml-2 min-h-11"
                          disabled={pending}
                          onClick={() => {
                            setCancelId(volunteer.id);
                            setReason("");
                            setActionError(null);
                          }}
                        >
                          Cancel placement
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          {cancelId ? (
            <form
              className="space-y-3 rounded-xl border border-border-subtle bg-muted p-4"
              onSubmit={(event) => {
                event.preventDefault();
                void cancel();
              }}
            >
              <label
                htmlFor="volunteer-cancel-reason"
                className="block text-sm font-medium text-text-primary"
              >
                Reason for cancellation
              </label>
              <input
                id="volunteer-cancel-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={240}
                required
                minLength={3}
                disabled={pending}
                className="min-h-11 w-full rounded-lg border border-border-subtle bg-surface px-3 text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  disabled={pending || reason.trim().length < 3}
                >
                  {pending ? "Cancelling…" : "Confirm cancellation"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setCancelId(null);
                    setReason("");
                  }}
                >
                  Keep placement
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      )}
    </Card>
  );
}
