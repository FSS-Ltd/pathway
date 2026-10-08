"use client";

import React from "react";
import Link from "next/link";
import { useAdminContext } from "@/lib/admin-context";
import { Badge, Button, Card, Select } from "@pathway/ui";
import {
  AdminAssignmentRow,
  AdminSwapRequestRow,
  fetchMyAssignments,
  fetchMySwapRequests,
  fetchStaff,
  updateAssignmentStatus,
  createSwapRequest,
  acceptSwapRequest,
  declineSwapRequest,
} from "../../lib/api-client";
import { toLocalDateKey } from "../../lib/date";
import { requestFailure, type RequestFailure } from "../../lib/request-error";

const assignmentStatusCopy: Record<AdminAssignmentRow["status"], string> = {
  pending: "Pending",
  confirmed: "Accepted",
  declined: "Declined",
};

const assignmentStatusTone: Record<
  AdminAssignmentRow["status"],
  "default" | "accent" | "warning" | "success"
> = {
  pending: "warning",
  confirmed: "success",
  declined: "default",
};

function formatTimeRange(startsAt?: string, endsAt?: string) {
  if (!startsAt || !endsAt) return { date: "Unknown", range: "-" };
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return { date, range: `${startTime} - ${endTime}` };
}

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const startOfWeek = (date: Date) => {
  const next = new Date(date);
  const day = next.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  next.setDate(next.getDate() + diff);
  next.setHours(0, 0, 0, 0);
  return next;
};

const formatWeekRange = (start: Date) => {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })} - ${end.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}`;
};

export default function MySchedulePage() {
  const { state: adminState } = useAdminContext();
  const [weekStart, setWeekStart] = React.useState<Date>(() =>
    startOfWeek(new Date()),
  );
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | "pending" | "confirmed" | "declined"
  >("all");
  const [assignments, setAssignments] = React.useState<AdminAssignmentRow[]>(
    [],
  );
  const [swaps, setSwaps] = React.useState<AdminSwapRequestRow[]>([]);
  const [staff, setStaff] = React.useState<{ id: string; fullName: string }[]>(
    [],
  );
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<RequestFailure | null>(null);
  const [actionError, setActionError] = React.useState<RequestFailure | null>(
    null,
  );
  const [staffError, setStaffError] = React.useState<RequestFailure | null>(
    null,
  );
  const [swapFormAssignmentId, setSwapFormAssignmentId] = React.useState<
    string | null
  >(null);
  const [swapToUserId, setSwapToUserId] = React.useState("");
  const [swapSubmitting, setSwapSubmitting] = React.useState(false);
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(
    null,
  );
  const userId =
    adminState.status === "ready" ? adminState.snapshot.userId : null;
  const dateFrom = toLocalDateKey(weekStart);
  const dateTo = toLocalDateKey(addDays(weekStart, 6));

  const loadData = React.useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    setStaffError(null);
    try {
      const [assignmentsRes, swapsRes, staffRes] = await Promise.all([
        fetchMyAssignments({
          userId,
          dateFrom,
          dateTo,
          status: statusFilter === "all" ? undefined : statusFilter,
        }),
        fetchMySwapRequests(userId),
        fetchStaff().catch((cause: unknown) => {
          setStaffError(
            requestFailure(cause, "Unable to load staff for swaps."),
          );
          return [];
        }),
      ]);
      setAssignments(assignmentsRes);
      setSwaps(swapsRes);
      setStaff(staffRes.map((s) => ({ id: s.id, fullName: s.fullName })));
    } catch (err) {
      setAssignments([]);
      setSwaps([]);
      setLoadError(requestFailure(err, "Unable to load your schedule."));
    } finally {
      setLoading(false);
    }
  }, [userId, dateFrom, dateTo, statusFilter]);

  React.useEffect(() => {
    if (userId) {
      void loadData();
    }
  }, [userId, loadData]);

  const handleAccept = async (assignmentId: string) => {
    setActionLoadingId(assignmentId);
    try {
      await updateAssignmentStatus(assignmentId, "confirmed");
      await loadData();
    } catch (err) {
      setActionError(requestFailure(err, "Unable to accept the assignment."));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDecline = async (assignmentId: string) => {
    setActionLoadingId(assignmentId);
    try {
      await updateAssignmentStatus(assignmentId, "declined");
      await loadData();
    } catch (err) {
      setActionError(requestFailure(err, "Unable to decline the assignment."));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRequestSwap = (assignmentId: string) => {
    setSwapFormAssignmentId(assignmentId);
    setSwapToUserId("");
  };

  const handleSwapSubmit = async () => {
    if (!userId || !swapFormAssignmentId || !swapToUserId) return;
    setSwapSubmitting(true);
    try {
      await createSwapRequest({
        fromUserId: userId,
        assignmentId: swapFormAssignmentId,
        toUserId: swapToUserId,
      });
      setSwapFormAssignmentId(null);
      setSwapToUserId("");
      await loadData();
    } catch (err) {
      setActionError(requestFailure(err, "Unable to create the swap request."));
    } finally {
      setSwapSubmitting(false);
    }
  };

  const handleAcceptSwap = async (swapId: string) => {
    setActionLoadingId(swapId);
    try {
      await acceptSwapRequest(swapId);
      await loadData();
    } catch (err) {
      setActionError(requestFailure(err, "Unable to accept the swap."));
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineSwap = async (swapId: string) => {
    setActionLoadingId(swapId);
    try {
      await declineSwapRequest(swapId);
      await loadData();
    } catch (err) {
      setActionError(requestFailure(err, "Unable to decline the swap."));
    } finally {
      setActionLoadingId(null);
    }
  };

  const inboundSwaps = swaps.filter(
    (s) => s.toUserId === userId && s.status === "REQUESTED",
  );
  const outboundSwaps = swaps.filter((s) => s.fromUserId === userId);
  const staffOptions = staff.filter((s) => s.id !== userId);

  if (adminState.status === "unauthenticated") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-text-primary font-heading">
          My schedule
        </h1>
        <p className="text-sm text-text-muted">
          Sign in to see your schedule and accept or decline assignments.
        </p>
        <Link href="/login" className="text-sm text-accent-strong underline">
          Sign in
        </Link>
      </div>
    );
  }

  if (adminState.status === "loading" || adminState.status === "switching") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-text-primary font-heading">
          My schedule
        </h1>
        <p className="text-sm text-text-muted">Loading your schedule…</p>
      </div>
    );
  }

  if (!userId) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-text-primary font-heading">
          My schedule
        </h1>
        <p className="text-sm text-text-muted">
          Your profile is not fully linked yet. Please sign out and sign in
          again, or contact your administrator to see your schedule here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary font-heading">
          My schedule
        </h1>
        <p className="text-sm text-text-muted">
          View your assigned sessions, accept or decline, and request swaps.
        </p>
      </div>

      <Card
        title="Assignments"
        description="Sessions you are assigned to this week."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart((p) => addDays(p, -7))}
            >
              Previous
            </Button>
            <span className="rounded-md border border-border-subtle bg-surface px-3 py-1 text-sm text-text-primary">
              {formatWeekRange(weekStart)}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWeekStart(startOfWeek(new Date()))}
            >
              Today
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setWeekStart((p) => addDays(p, 7))}
            >
              Next
            </Button>
            <Select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
              className="w-36"
              aria-label="Filter by status"
            >
              <option value="all">All statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Accepted</option>
              <option value="declined">Declined</option>
            </Select>
          </div>
        }
      >
        {actionError ? (
          <p role="alert" className="text-sm text-status-danger">
            {actionError.message}
          </p>
        ) : null}
        {loadError ? (
          <div className="flex flex-col gap-2 rounded-md bg-status-danger/5 p-4 text-sm text-status-danger">
            <span className="font-semibold">Schedule unavailable</span>
            <span>{loadError.message}</span>
            <Button size="sm" variant="secondary" onClick={loadData}>
              Retry
            </Button>
          </div>
        ) : loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-md bg-muted" />
            ))}
          </div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-text-muted">
            No assignments for this week. Check back later or pick another week.
          </p>
        ) : (
          <ul className="space-y-3">
            {assignments.map((a) => {
              const { date, range } = formatTimeRange(a.startsAt, a.endsAt);
              const isSwapForm = swapFormAssignmentId === a.id;
              const isBusy = actionLoadingId === a.id;
              return (
                <li
                  key={a.id}
                  className={`flex flex-col gap-2 rounded-lg border-2 p-3 ${
                    !a.sessionGroupColor
                      ? "border-border-subtle bg-surface-alt"
                      : ""
                  }`}
                  style={
                    a.sessionGroupColor
                      ? {
                          borderColor: a.sessionGroupColor,
                          backgroundColor: `${a.sessionGroupColor}15`,
                        }
                      : undefined
                  }
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-medium text-text-primary">
                        {a.sessionGroupName ?? a.sessionTitle ?? "Session"}
                      </span>
                      <span className="ml-2 text-sm text-text-muted">
                        {date} · {range}
                      </span>
                    </div>
                    <Badge variant={assignmentStatusTone[a.status]}>
                      {assignmentStatusCopy[a.status]}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {a.status === "pending" && (
                      <>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAccept(a.id)}
                          disabled={isBusy}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDecline(a.id)}
                          disabled={isBusy}
                        >
                          Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRequestSwap(a.id)}
                        >
                          Request swap
                        </Button>
                      </>
                    )}
                  </div>
                  {isSwapForm && (
                    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-md border border-border-subtle bg-surface p-3">
                      {staffError ? (
                        <p
                          role="alert"
                          className="w-full text-sm text-status-danger"
                        >
                          {staffError.message}
                        </p>
                      ) : null}
                      <label className="flex flex-col gap-1 text-sm">
                        <span className="text-text-muted">Swap with</span>
                        <Select
                          value={swapToUserId}
                          onChange={(e) => setSwapToUserId(e.target.value)}
                          className="min-w-[180px]"
                          disabled={Boolean(staffError)}
                        >
                          <option value="">Select staff…</option>
                          {staffOptions.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.fullName}
                            </option>
                          ))}
                        </Select>
                      </label>
                      <Button
                        size="sm"
                        onClick={handleSwapSubmit}
                        disabled={
                          !swapToUserId || swapSubmitting || Boolean(staffError)
                        }
                      >
                        Submit request
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setSwapFormAssignmentId(null);
                          setSwapToUserId("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card
        title="Swap requests"
        description="Inbound requests you can accept or decline; outbound requests you sent."
      >
        {loadError ? (
          <p role="alert" className="text-sm text-status-danger">
            Swap requests are unavailable. Retry the schedule above.
          </p>
        ) : loading ? (
          <div className="h-12 animate-pulse rounded-md bg-muted" />
        ) : inboundSwaps.length === 0 && outboundSwaps.length === 0 ? (
          <p className="text-sm text-text-muted">No swap requests right now.</p>
        ) : (
          <div className="space-y-4">
            {inboundSwaps.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-text-muted">
                  Inbound
                </h3>
                <ul className="space-y-2">
                  {inboundSwaps.map((s) => (
                    <li
                      key={s.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border-subtle bg-surface-alt p-2 text-sm"
                    >
                      <span className="text-text-primary">
                        Assignment {s.assignmentId.slice(0, 8)}…
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => handleAcceptSwap(s.id)}
                          disabled={actionLoadingId === s.id}
                        >
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeclineSwap(s.id)}
                          disabled={actionLoadingId === s.id}
                        >
                          Decline
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {outboundSwaps.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-text-muted">
                  Outbound
                </h3>
                <ul className="space-y-2">
                  {outboundSwaps.map((s) => (
                    <li
                      key={s.id}
                      className="rounded-md border border-border-subtle bg-surface-alt p-2 text-sm text-text-primary"
                    >
                      Assignment {s.assignmentId.slice(0, 8)}… →{" "}
                      <Badge variant="default">{s.status}</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
