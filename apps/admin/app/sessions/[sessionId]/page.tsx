"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { useAdminContext } from "@/lib/admin-context";
import { ArrowLeft, CalendarClock, MapPin, Trash2 } from "lucide-react";
import { Badge, Button, Card, Label, Select } from "@pathway/ui";
import {
  AdminAssignmentRow,
  AdminLessonDetail,
  AdminSessionDetail,
  createAssignment,
  deleteAssignment,
  fetchAssignmentsForOrg,
  fetchAttendanceDetailBySessionId,
  fetchAuthDebugContext,
  fetchLessonById,
  fetchSessionById,
  fetchSessionStaffAttendance,
  fetchHandoverForSession,
  fetchStaffEligibilityForSession,
  updateAssignment,
  updateAssignmentStatus,
  upsertSessionStaffAttendance,
  type StaffAttendanceRosterItem,
  type StaffEligibilityRow,
} from "../../../lib/api-client";
import { toLocalDateKey } from "../../../lib/date";
import { useAdminAccess } from "../../../lib/use-admin-access";
import { canAccessAdminSection, canAccessSafeguardingAdmin } from "../../../lib/access";

const eligibilityReasonLabel: Record<
  NonNullable<StaffEligibilityRow["reason"]>,
  string
> = {
  unavailable_at_time: "Unavailable at this time",
  does_not_prefer_group: "Does not prefer this age group",
  blocked_on_date: "Blocked on this date",
};

const statusCopy: Record<AdminSessionDetail["status"], string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

const statusTone: Record<
  AdminSessionDetail["status"],
  "default" | "accent" | "warning" | "success"
> = {
  not_started: "default",
  in_progress: "accent",
  completed: "success",
};

const assignmentStatusTone: Record<
  AdminAssignmentRow["status"],
  "default" | "accent" | "warning" | "success"
> = {
  pending: "warning",
  confirmed: "success",
  declined: "default",
};

const assignmentStatusLabel: Record<AdminAssignmentRow["status"], string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  declined: "Declined",
};

function formatTimeRange(startsAt?: string, endsAt?: string) {
  if (!startsAt || !endsAt) return null;
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

function buildHandoverHref(
  session: AdminSessionDetail & { groupId?: string | null; groupIds?: string[] },
) {
  const primaryGroupId =
    session.groupIds?.[0] ?? session.groupId ?? null;
  if (!primaryGroupId) return "/handover/write";
  const start = new Date(session.startsAt);
  const handoverDate = toLocalDateKey(start);
  const params = new URLSearchParams();
  params.set("sessionId", session.id);
  params.set("groupId", primaryGroupId);
  params.set("handoverDate", handoverDate);
  return `/handover/write?${params.toString()}`;
}

export default function SessionDetailPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const { state: adminState } = useAdminContext();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const sessionId = params.sessionId;

  const [session, setSession] = React.useState<AdminSessionDetail | null>(null);
  const [handoverForSession, setHandoverForSession] = React.useState<{
    handoverLogId: string | null;
    status?: string;
  } | null>(null);
  const currentUserId = adminState.status === "ready" ? adminState.snapshot.userId : null;
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [assignments, setAssignments] = React.useState<AdminAssignmentRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = React.useState(false);
  const [assignmentError, setAssignmentError] = React.useState<string | null>(
    null,
  );
  const [formStaffId, setFormStaffId] = React.useState("");
  const [formRole, setFormRole] = React.useState("Lead");
  const [formStatus, setFormStatus] =
    React.useState<"pending" | "confirmed">("confirmed");
  const [formSubmitting, setFormSubmitting] = React.useState(false);
  const [rowActionId, setRowActionId] = React.useState<string | null>(null);
  const [staffEligibility, setStaffEligibility] = React.useState<
    StaffEligibilityRow[]
  >([]);
  const [staffEligibilityLoading, setStaffEligibilityLoading] =
    React.useState(false);
  const [lessonDetail, setLessonDetail] = React.useState<AdminLessonDetail | null>(null);
  const [attendanceSummary, setAttendanceSummary] = React.useState<
    { present: number; absent: number; late: number; unknown: number } | null
  >(null);
  const [staffAttendanceRoster, setStaffAttendanceRoster] = React.useState<
    StaffAttendanceRosterItem[] | null
  >(null);
  const [staffAttendanceError, setStaffAttendanceError] = React.useState<string | null>(null);
  const [staffAttendanceSaving, setStaffAttendanceSaving] = React.useState<string | null>(null);
  const [authDebugContext, setAuthDebugContext] = React.useState<Awaited<ReturnType<typeof fetchAuthDebugContext>> | null>(null);

  const isAdmin = canAccessAdminSection(role);
  const canStartHandover = role.isStaff || isAdmin;

  const refreshAssignments = React.useCallback(
    async (sessionMeta: AdminSessionDetail | null) => {
      if (!sessionMeta) return;
      setAssignmentsLoading(true);
      setAssignmentError(null);
      try {
        const lookup = {
          [sessionMeta.id]: {
            title: sessionMeta.title,
            startsAt: sessionMeta.startsAt,
            endsAt: sessionMeta.endsAt,
          },
        };
        const rows = await fetchAssignmentsForOrg({
          sessionId: sessionMeta.id,
          sessionLookup: lookup,
        });
        setAssignments(rows);
      } catch (err) {
        setAssignmentError(
          err instanceof Error ? err.message : "Failed to load assignments",
        );
      } finally {
        setAssignmentsLoading(false);
      }
    },
    [],
  );

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    setAssignmentError(null);
    setLessonDetail(null);
    setAttendanceSummary(null);
    setStaffAttendanceError(null);
    try {
      const result = await fetchSessionById(sessionId);
      setSession(result);
      if (!result) {
        setNotFound(true);
        setAssignments([]);
        setHandoverForSession({ handoverLogId: null });
      } else {
        fetchHandoverForSession(sessionId)
          .then(setHandoverForSession)
          .catch(() => setHandoverForSession({ handoverLogId: null }));
        setAssignments(result.assignments ?? []);
        await refreshAssignments(result);
        const hasBreakdown =
          result.presentCount !== undefined &&
          result.absentCount !== undefined &&
          result.lateCount !== undefined;
        if (result.lessonId && !result.lesson) {
          fetchLessonById(result.lessonId)
            .then(setLessonDetail)
            .catch(() => setLessonDetail(null));
        }
        if (!hasBreakdown) {
          fetchAttendanceDetailBySessionId(result.id)
            .then((d) => setAttendanceSummary(d?.summary ?? null))
            .catch(() => setAttendanceSummary(null));
        }
        if (isAdmin) {
          fetchSessionStaffAttendance(result.id)
            .then(setStaffAttendanceRoster)
            .catch(() => setStaffAttendanceRoster([]));
        } else {
          setStaffAttendanceRoster(null);
        }
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load session",
      );
      setSession(null);
      setHandoverForSession(null);
      setAssignments([]);
      setStaffAttendanceRoster(null);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, refreshAssignments, isAdmin]);

  React.useEffect(() => {
    if (sessionStatus === "authenticated") {
      void load();
    }
  }, [sessionStatus, load]);

  React.useEffect(() => {
    if (!session?.startsAt || !session?.endsAt) {
      setStaffEligibility([]);
      return;
    }
    const sessionWithGroups = session as {
      groupIds?: string[];
      groupId?: string | null;
    };
    const groupId =
      sessionWithGroups.groupIds?.[0] ?? sessionWithGroups.groupId ?? null;
    setStaffEligibilityLoading(true);
    fetchStaffEligibilityForSession({
      groupId,
      startsAt: session.startsAt,
      endsAt: session.endsAt,
    })
      .then(setStaffEligibility)
      .catch(() => setStaffEligibility([]))
      .finally(() => setStaffEligibilityLoading(false));
  }, [
    session?.id,
    session?.startsAt,
    session?.endsAt,
    (session as { groupIds?: string[]; groupId?: string | null } | null)
      ?.groupIds?.[0],
    (session as { groupId?: string | null } | null)?.groupId,
  ]);

  const assignedStaffIds = React.useMemo(
    () => new Set(assignments.map((a) => a.staffId)),
    [assignments],
  );
  const staffOptions = React.useMemo(
    () => staffEligibility.filter((s) => !assignedStaffIds.has(s.id)),
    [staffEligibility, assignedStaffIds],
  );

  const time = formatTimeRange(session?.startsAt, session?.endsAt);

  const hasSessionBreakdown =
    session?.presentCount !== undefined &&
    session?.absentCount !== undefined &&
    session?.lateCount !== undefined;
  const attendanceBreakdown =
    hasSessionBreakdown || attendanceSummary != null;
  const displayPresent = hasSessionBreakdown
    ? session!.presentCount!
    : attendanceSummary?.present ?? 0;
  const displayAbsent = hasSessionBreakdown
    ? session!.absentCount!
    : attendanceSummary?.absent ?? 0;
  const displayLate = hasSessionBreakdown
    ? session!.lateCount!
    : attendanceSummary?.late ?? 0;

  const handleStatusChange = React.useCallback(
    async (assignmentId: string, status: AdminAssignmentRow["status"]) => {
      if (!session) return;
      setRowActionId(assignmentId);
      setAssignmentError(null);
      try {
        await updateAssignment(
          assignmentId,
          { status },
          {
            sessionLookup: {
              [session.id]: {
                title: session.title,
                startsAt: session.startsAt,
                endsAt: session.endsAt,
              },
            },
          },
        );
        await refreshAssignments(session);
      } catch (err) {
        setAssignmentError(
          err instanceof Error ? err.message : "Failed to update assignment",
        );
      } finally {
        setRowActionId(null);
      }
    },
    [refreshAssignments, session],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/sessions" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to sessions
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={load}>
            Refresh
          </Button>
          <Button size="sm" asChild>
            <Link href={`/attendance/${sessionId}`}>Take attendance</Link>
          </Button>
          {canStartHandover && session && (
            handoverForSession?.handoverLogId ? (
              <Button size="sm" asChild variant="secondary">
                <Link
                  href={
                    isAdmin
                      ? `/admin/handover/${handoverForSession.handoverLogId}`
                      : `/handover/write?handoverId=${handoverForSession.handoverLogId}`
                  }
                >
                  View handover
                </Link>
              </Button>
            ) : (
              <Button size="sm" asChild>
                <Link
                  href={buildHandoverHref(
                    session as AdminSessionDetail & {
                      groupId?: string | null;
                      groupIds?: string[];
                    },
                  )}
                >
                  Start handover
                </Link>
              </Button>
            )
          )}
          {isAdmin && (
            <Button asChild size="sm">
              <Link href={`/sessions/${sessionId}/edit`}>Edit session</Link>
            </Button>
          )}
        </div>
      </div>

      {sessionStatus === "loading" || isLoading ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex flex-col gap-3">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-4 w-64 animate-pulse rounded bg-muted" />
              <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            </div>
          </Card>
          <Card>
            <div className="flex flex-col gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        </div>
      ) : notFound ? (
        <Card title="Session Not Found">
          <p className="text-sm text-text-muted">
            We couldn’t find a session matching id <strong>{sessionId}</strong>.
          </p>
          <div className="mt-4">
            <Button
              variant="secondary"
              onClick={() => router.push("/sessions")}
            >
              Back to sessions
            </Button>
          </div>
        </Card>
      ) : error ? (
        <Card title="Error Loading Session">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => router.push("/sessions")}
            >
              Back to sessions
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : session ? (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-semibold text-text-primary font-heading">
                  {session.title}
                </h1>
                <Badge variant={statusTone[session.status]}>
                  {statusCopy[session.status]}
                </Badge>
              </div>
              {time ? (
                <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-4 w-4" />
                    {time.date} · {time.range}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-4 w-4" />
                    {session.room} · {session.ageGroup}
                  </span>
                </div>
              ) : null}
              {(() => {
                const lesson = session.lesson ?? (lessonDetail ? {
                  id: lessonDetail.id,
                  title: lessonDetail.title,
                  description: lessonDetail.description,
                  resources: lessonDetail.resources?.length
                    ? lessonDetail.resources.map((r) => ({ label: r.label, url: null, type: r.type }))
                    : null,
                } : null);
                if (lesson?.description || (lesson?.resources && lesson.resources.length > 0)) {
                  const safeUrl = (url: string | null | undefined) =>
                    typeof url === "string" && (url.startsWith("https://") || url.startsWith("http://"));
                  return (
                    <div className="space-y-2 text-sm text-text-muted">
                      {lesson.description ? (
                        <p className="text-text-primary">{lesson.description}</p>
                      ) : null}
                      {lesson.resources && lesson.resources.length > 0 ? (
                        <ul className="list-inside list-disc space-y-1">
                          {lesson.resources.map((r, i) => {
                            const label = r.label ?? "Resource";
                            const url = r.url;
                            return (
                              <li key={i}>
                                {url && safeUrl(url) ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-accent-strong underline-offset-2 hover:underline"
                                  >
                                    {label}
                                  </a>
                                ) : (
                                  label
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </div>
                  );
                }
                return (
                  <div className="text-sm text-text-muted">
                    Lesson resources and description will appear when available.
                  </div>
                );
              })()}
            </div>
          </Card>

          <Card title="Attendance">
            <div className="space-y-2 text-sm text-text-primary">
              <div className="font-semibold">
                {session.attendanceMarked} of {session.attendanceTotal} children
                marked
              </div>
              {attendanceBreakdown ? (
                <ul className="space-y-1 text-text-muted">
                  <li>Present: {displayPresent}</li>
                  <li>Absent: {displayAbsent}</li>
                  <li>Late: {displayLate}</li>
                </ul>
              ) : (
                <p className="text-text-muted">
                  Breakdown will appear when attendance is recorded.
                </p>
              )}
            </div>
          </Card>

          <Card
            className="md:col-span-3"
            title="Scheduled staff"
            description={isAdmin ? "Schedule staff onto this session and keep statuses up to date." : "Staff assigned to this session."}
          >
            {assignmentError ? (
              <div className="mb-4 rounded-md bg-status-danger/5 px-3 py-2 text-sm text-status-danger">
                {assignmentError}
              </div>
            ) : null}

            {assignmentsLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                <div className="h-16 w-full animate-pulse rounded bg-muted" />
              </div>
            ) : assignments.length ? (
              <div className="space-y-3">
                {assignments.map((assignment) => {
                  const timeRange = formatTimeRange(
                    assignment.startsAt,
                    assignment.endsAt,
                  );
                  const isOwnAssignment = currentUserId != null && assignment.staffId === currentUserId;
                  const showAcceptDecline = !isAdmin && isOwnAssignment && assignment.status === "pending";
                  return (
                    <div
                      key={assignment.id}
                      className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-alt p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold text-text-primary">
                            {assignment.staffName}
                          </span>
                          <Badge variant="default">{assignment.roleLabel}</Badge>
                          <Badge variant={assignmentStatusTone[assignment.status]}>
                            {assignmentStatusLabel[assignment.status]}
                          </Badge>
                        </div>
                        <div className="text-xs text-text-muted">
                          {assignment.sessionTitle ?? session.title} ·{" "}
                          {timeRange
                            ? `${timeRange.date} ${timeRange.range}`
                            : "Time not set"}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {showAcceptDecline ? (
                          <>
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={async () => {
                                setRowActionId(assignment.id);
                                setAssignmentError(null);
                                try {
                                  await updateAssignmentStatus(assignment.id, "confirmed");
                                  await refreshAssignments(session);
                                } catch (err) {
                                  setAssignmentError(err instanceof Error ? err.message : "Failed to accept");
                                } finally {
                                  setRowActionId(null);
                                }
                              }}
                              disabled={rowActionId === assignment.id}
                            >
                              Accept
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                setRowActionId(assignment.id);
                                setAssignmentError(null);
                                try {
                                  await updateAssignmentStatus(assignment.id, "declined");
                                  await refreshAssignments(session);
                                } catch (err) {
                                  setAssignmentError(err instanceof Error ? err.message : "Failed to decline");
                                } finally {
                                  setRowActionId(null);
                                }
                              }}
                              disabled={rowActionId === assignment.id}
                            >
                              Decline
                            </Button>
                          </>
                        ) : isAdmin ? (
                          <>
                            <label className="text-xs text-text-muted">
                              Status
                              <select
                                value={assignment.status}
                                onChange={(e) =>
                                  handleStatusChange(
                                    assignment.id,
                                    e.target.value as AdminAssignmentRow["status"],
                                  )
                                }
                                className="ml-2 rounded-md border border-border-subtle bg-white px-2 py-1 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-60"
                                disabled={rowActionId === assignment.id}
                              >
                                <option value="pending">Pending</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="declined">Declined</option>
                              </select>
                            </label>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                setRowActionId(assignment.id);
                                setAssignmentError(null);
                                try {
                                  await deleteAssignment(assignment.id);
                                  await refreshAssignments(session);
                                } catch (err) {
                                  setAssignmentError(
                                    err instanceof Error
                                      ? err.message
                                      : "Unable to remove assignment",
                                  );
                                } finally {
                                  setRowActionId(null);
                                }
                              }}
                              disabled={rowActionId === assignment.id}
                              className="text-status-danger hover:text-status-danger"
                            >
                              <Trash2 className="mr-1 h-4 w-4" />
                              Remove
                            </Button>
                          </>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-text-muted">
                {isAdmin ? "No staff are assigned yet. Add someone below." : "No staff assigned yet."}
              </p>
            )}

            {isAdmin && (
            <div className="mt-6 border-t border-border-subtle pt-4">
              <h3 className="text-sm font-semibold text-text-primary">
                Add staff
              </h3>
              <p className="text-xs text-text-muted">
                Choose a staff member and role. Eligible staff (available at this
                time, prefer this class) are listed first; you may still add
                others.
              </p>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!session) return;
                  if (!formStaffId.trim()) {
                    setAssignmentError("Select a staff member to add.");
                    return;
                  }
                  setFormSubmitting(true);
                  setAssignmentError(null);
                  try {
                    await createAssignment(
                      {
                        sessionId: session.id,
                        staffId: formStaffId.trim(),
                        role: formRole,
                        status: formStatus,
                      },
                      {
                        sessionLookup: {
                          [session.id]: {
                            title: session.title,
                            startsAt: session.startsAt,
                            endsAt: session.endsAt,
                          },
                        },
                      },
                    );
                    await refreshAssignments(session);
                    setFormStaffId("");
                    setFormRole("Lead");
                    setFormStatus("confirmed");
                  } catch (err) {
                    setAssignmentError(
                      err instanceof Error
                        ? err.message
                        : "Failed to add assignment",
                    );
                  } finally {
                    setFormSubmitting(false);
                  }
                }}
                className="mt-3 grid gap-3 md:grid-cols-4"
              >
                <div className="flex flex-col gap-1 md:col-span-2">
                  <Label htmlFor="add-staff">Staff member</Label>
                  <Select
                    id="add-staff"
                    value={formStaffId}
                    onChange={(e) => setFormStaffId(e.target.value)}
                    disabled={staffEligibilityLoading}
                  >
                    <option value="">Select…</option>
                    {staffOptions.map((s) => (
                      <option
                        key={s.id}
                        value={s.id}
                        title={
                          s.reason
                            ? eligibilityReasonLabel[s.reason]
                            : undefined
                        }
                      >
                        {s.eligible
                          ? s.email
                            ? `${s.fullName} (${s.email})`
                            : s.fullName
                          : `${s.fullName}${s.email ? ` (${s.email})` : ""} — ${s.reason ? eligibilityReasonLabel[s.reason] : "Unavailable"}`}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="add-role">Role</Label>
                  <Select
                    id="add-role"
                    value={formRole}
                    onChange={(e) => setFormRole(e.target.value)}
                  >
                    <option value="Lead">Lead</option>
                    <option value="Support">Support</option>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="add-status">Status</Label>
                  <Select
                    id="add-status"
                    value={formStatus}
                    onChange={(e) =>
                      setFormStatus(e.target.value as "pending" | "confirmed")
                    }
                  >
                    <option value="confirmed">Confirmed</option>
                    <option value="pending">Pending</option>
                  </Select>
                </div>
                <div className="md:col-span-4 flex flex-wrap items-center gap-2">
                  <Button type="submit" size="sm" disabled={formSubmitting}>
                    {formSubmitting ? "Adding…" : "Add to session"}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setFormStaffId("");
                      setFormRole("Lead");
                      setFormStatus("confirmed");
                      setAssignmentError(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
            )}
          </Card>

          {isAdmin && (
            <Card
              className="md:col-span-2"
              title="Staff attendance"
              description="Mark whether each staff member was present for this session."
            >
              {staffAttendanceError ? (
                <div className="mb-4 space-y-2 rounded-md bg-status-danger/5 px-3 py-2 text-sm text-status-danger">
                  <div>{staffAttendanceError}</div>
                  {staffAttendanceError?.includes("403") ? (
                    <div className="space-y-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={async () => {
                          try {
                            const ctx = await fetchAuthDebugContext();
                            setAuthDebugContext(ctx);
                          } catch {
                            setAuthDebugContext(null);
                          }
                        }}
                      >
                        Debug auth context
                      </Button>
                      {authDebugContext ? (
                        <pre className="max-h-64 overflow-auto rounded border border-border-subtle bg-surface p-2 text-xs text-text-primary">
                          {JSON.stringify(authDebugContext, null, 2)}
                        </pre>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {staffAttendanceRoster === null ? (
                <div className="space-y-3">
                  <div className="h-4 w-48 animate-pulse rounded bg-muted" />
                  <div className="h-16 w-full animate-pulse rounded bg-muted" />
                </div>
              ) : staffAttendanceRoster.length === 0 ? (
                <p className="text-sm text-text-muted">
                  No staff assigned to this session. Add staff above first.
                </p>
              ) : (
                <div className="space-y-3">
                  {staffAttendanceRoster.map((staff) => (
                    <div
                      key={staff.staffUserId}
                      className="flex flex-col gap-2 rounded-lg border border-border-subtle bg-surface-alt p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <span className="font-semibold text-text-primary">
                          {staff.displayName}
                        </span>
                        <span className="ml-2 text-sm text-text-muted">
                          {staff.roleLabel}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(["PRESENT", "ABSENT", "UNKNOWN"] as const).map(
                          (status) => (
                            <Button
                              key={status}
                              size="sm"
                              variant={
                                staff.attendanceStatus === status
                                  ? "primary"
                                  : "outline"
                              }
                              className="h-8 min-w-0 px-2 text-xs capitalize"
                              disabled={
                                staffAttendanceSaving === staff.staffUserId
                              }
                              onClick={async () => {
                                if (!session) return;
                                setStaffAttendanceSaving(staff.staffUserId);
                                setStaffAttendanceError(null);
                                try {
                                  const updated =
                                    await upsertSessionStaffAttendance(
                                      session.id,
                                      {
                                        staffUserId: staff.staffUserId,
                                        status,
                                      },
                                    );
                                  setStaffAttendanceRoster(updated);
                                } catch (err) {
                                  setStaffAttendanceError(
                                    err instanceof Error
                                      ? err.message
                                      : "Failed to update presence",
                                  );
                                } finally {
                                  setStaffAttendanceSaving(null);
                                }
                              }}
                            >
                              {status === "PRESENT"
                                ? "Present"
                                : status === "ABSENT"
                                  ? "Not present"
                                  : "Unknown"}
                            </Button>
                          ),
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}

          {!isLoadingAccess && canAccessSafeguardingAdmin(role) ? (
            <Card title="Related notes & concerns">
              {session.relatedSafeguarding?.notes?.length || session.relatedSafeguarding?.concerns?.length ? (
                <div className="space-y-2 text-sm">
                  {session.relatedSafeguarding.concerns?.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-2">
                      <span className="text-text-muted">
                        Concern · {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : "—"} {c.status ? `· ${c.status}` : ""}
                      </span>
                      <Link
                        href={`/safeguarding/concerns/${c.id}`}
                        className="text-accent-strong text-xs underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                  {session.relatedSafeguarding.notes?.map((n) => (
                    <div key={n.id} className="flex items-center justify-between gap-2">
                      <span className="text-text-muted">
                        Note · {n.createdAt ? new Date(n.createdAt).toLocaleDateString() : "—"} {n.status ? `· ${n.status}` : ""}
                      </span>
                      <Link
                        href="/safeguarding"
                        className="text-accent-strong text-xs underline-offset-2 hover:underline"
                      >
                        View
                      </Link>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  Related notes and concerns will appear here when available. No safeguarding detail is shown on this page.
                </p>
              )}
            </Card>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
