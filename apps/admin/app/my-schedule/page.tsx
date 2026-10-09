"use client";

import React from "react";
import Link from "next/link";
import { useAdminContext } from "@/lib/admin-context";
import { Button, Card, Select } from "@pathway/ui";
import {
  AdminAssignmentRow,
  AdminSwapRequestRow,
  SwapCandidate,
  fetchMyAssignments,
  fetchMySwapRequests,
  fetchSwapCandidates,
  updateAssignmentStatus,
  createSwapRequest,
  acceptSwapRequest,
  declineSwapRequest,
} from "../../lib/api-client";
import { toLocalDateKey } from "../../lib/date";
import { requestFailure, type RequestFailure } from "../../lib/request-error";
import { SwapCandidateForm, SwapRequestList } from "./swap-panels";
import { AssignmentList } from "./assignment-list";
import { TeamRota } from "./team-rota";

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
  const [candidates, setCandidates] = React.useState<SwapCandidate[]>([]);
  const [candidateLoading, setCandidateLoading] = React.useState(false);
  const [candidateRevision, setCandidateRevision] = React.useState(0);
  const loadSequence = React.useRef(0);
  const [loading, setLoading] = React.useState(true);
  const [loadedScope, setLoadedScope] = React.useState<string | null>(null);
  const [loadError, setLoadError] = React.useState<RequestFailure | null>(null);
  const [actionError, setActionError] = React.useState<RequestFailure | null>(
    null,
  );
  const [candidateError, setCandidateError] =
    React.useState<RequestFailure | null>(null);
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
  const siteId =
    adminState.status === "ready" ? adminState.snapshot.activeSiteId : null;
  const dateFrom = toLocalDateKey(weekStart);
  const dateTo = toLocalDateKey(addDays(weekStart, 6));
  const scopeKey =
    userId && siteId
      ? `${userId}:${siteId}:${dateFrom}:${dateTo}:${statusFilter}`
      : null;
  const showingCurrentScope = loadedScope === scopeKey;

  const loadData = React.useCallback(async () => {
    if (!userId || !siteId || !scopeKey) return;
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError(null);
    setActionError(null);
    try {
      const [assignmentsRes, swapsRes] = await Promise.all([
        fetchMyAssignments({
          userId,
          dateFrom,
          dateTo,
          status: statusFilter === "all" ? undefined : statusFilter,
        }),
        fetchMySwapRequests(userId),
      ]);
      if (sequence !== loadSequence.current) return;
      setAssignments(assignmentsRes);
      setSwaps(swapsRes);
      setLoadedScope(scopeKey);
    } catch (err) {
      if (sequence !== loadSequence.current) return;
      setAssignments([]);
      setSwaps([]);
      setLoadError(requestFailure(err, "Unable to load your schedule."));
      setLoadedScope(scopeKey);
    } finally {
      if (sequence === loadSequence.current) setLoading(false);
    }
  }, [userId, siteId, scopeKey, dateFrom, dateTo, statusFilter]);

  React.useEffect(() => {
    void loadData();
    return () => {
      loadSequence.current += 1;
    };
  }, [loadData]);

  React.useEffect(() => {
    setSwapFormAssignmentId(null);
    setSwapToUserId("");
  }, [siteId]);

  React.useEffect(() => {
    if (!swapFormAssignmentId || !siteId) return;
    const controller = new AbortController();
    setCandidateLoading(true);
    setCandidateError(null);
    setCandidates([]);
    void fetchSwapCandidates(swapFormAssignmentId, controller.signal)
      .then((loaded) => {
        if (!controller.signal.aborted) setCandidates(loaded);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setCandidateError(
            requestFailure(cause, "Unable to load staff for swaps."),
          );
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setCandidateLoading(false);
      });
    return () => controller.abort();
  }, [swapFormAssignmentId, siteId, candidateRevision]);

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

  const inboundSwaps = swaps.filter((s) => s.toUserId === userId);
  const outboundSwaps = swaps.filter((s) => s.fromUserId === userId);

  if (adminState.status === "unauthenticated") {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary">
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
              aria-label="Previous week"
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
              aria-label="Next week"
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
        {showingCurrentScope && actionError ? (
          <p role="alert" className="text-sm text-status-danger">
            {actionError.message}
          </p>
        ) : null}
        {!showingCurrentScope || loading ? (
          <div
            role="status"
            className="space-y-3"
            aria-label="Loading schedule"
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-md bg-muted motion-safe:animate-pulse"
              />
            ))}
          </div>
        ) : loadError ? (
          <div className="flex flex-col gap-2 rounded-md bg-status-danger/5 p-4 text-sm text-status-danger">
            <span className="font-semibold">Schedule unavailable</span>
            <span>{loadError.message}</span>
            <Button size="sm" variant="secondary" onClick={loadData}>
              Retry
            </Button>
          </div>
        ) : assignments.length === 0 ? (
          <p className="text-sm text-text-muted">
            No assignments for this week. Check back later or pick another week.
          </p>
        ) : (
          <AssignmentList
            assignments={assignments}
            activeSwapAssignmentId={swapFormAssignmentId}
            busyAssignmentId={actionLoadingId}
            onAccept={(id) => void handleAccept(id)}
            onDecline={(id) => void handleDecline(id)}
            onRequestSwap={handleRequestSwap}
            swapForm={
              <SwapCandidateForm
                candidates={candidates}
                error={candidateError}
                loading={candidateLoading}
                selectedUserId={swapToUserId}
                submitting={swapSubmitting}
                onCancel={() => {
                  setSwapFormAssignmentId(null);
                  setSwapToUserId("");
                }}
                onRetry={() => {
                  setSwapToUserId("");
                  setCandidateRevision((value) => value + 1);
                }}
                onSelect={setSwapToUserId}
                onSubmit={() => void handleSwapSubmit()}
              />
            }
          />
        )}
      </Card>

      <Card
        title="Swap requests"
        description="Review requests from colleagues and track the requests you sent."
      >
        {!showingCurrentScope || loading ? (
          <div
            role="status"
            className="h-12 rounded-md bg-muted motion-safe:animate-pulse"
          />
        ) : loadError ? (
          <p role="alert" className="text-sm text-status-danger">
            Swap requests are unavailable. Retry the schedule above.
          </p>
        ) : (
          <SwapRequestList
            inbound={inboundSwaps}
            outbound={outboundSwaps}
            actionLoadingId={actionLoadingId}
            onAccept={(id) => void handleAcceptSwap(id)}
            onDecline={(id) => void handleDeclineSwap(id)}
          />
        )}
      </Card>
      <TeamRota siteId={siteId} dateFrom={dateFrom} dateTo={dateTo} />
    </div>
  );
}
