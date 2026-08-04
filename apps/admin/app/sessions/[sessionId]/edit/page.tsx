"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import { DropdownMultiSelect } from "../../../../components/dropdown-multi-select";
import {
  AdminSessionFormValues,
  AdminAssignmentRow,
  fetchSessionById,
  updateSession,
  fetchGroups,
  fetchAssignmentsForOrg,
  fetchStaffEligibilityForSession,
  createAssignment,
  deleteAssignment,
  type GroupOption,
  type StaffEligibilityRow,
} from "../../../../lib/api-client";

const eligibilityReasonLabel: Record<
  NonNullable<StaffEligibilityRow["reason"]>,
  string
> = {
  unavailable_at_time: "Unavailable at this time",
  does_not_prefer_group: "Does not prefer this age group",
  blocked_on_date: "Blocked on this date",
};

export default function EditSessionPage() {
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const sessionId = params.sessionId;

  const [form, setForm] = React.useState<AdminSessionFormValues | null>(null);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] =
    React.useState<Partial<Record<keyof AdminSessionFormValues, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const [assignments, setAssignments] = React.useState<AdminAssignmentRow[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = React.useState(false);
  const [assignmentError, setAssignmentError] = React.useState<string | null>(
    null,
  );
  const [staffEligibility, setStaffEligibility] = React.useState<
    StaffEligibilityRow[]
  >([]);
  const [staffEligibilityLoading, setStaffEligibilityLoading] =
    React.useState(false);
  const [selectedStaffIds, setSelectedStaffIds] = React.useState<string[]>([]);
  const [addRole, setAddRole] = React.useState("Lead");
  const [addSubmitting, setAddSubmitting] = React.useState(false);
  const [removeId, setRemoveId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchGroups({ activeOnly: true })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [sessionStatus]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchSessionById(sessionId);
        if (!result) {
          setError("Session not found.");
          setForm(null);
        } else {
          const sessionResult = result as {
            groupIds?: string[];
            groupId?: string;
          };
          setForm({
            title: result.title,
            startsAt: result.startsAt.slice(0, 16),
            endsAt: result.endsAt.slice(0, 16),
            groupIds:
              sessionResult.groupIds ??
              (sessionResult.groupId ? [sessionResult.groupId] : []),
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load session.");
        setForm(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [sessionId, sessionStatus]);

  const sessionLookup = React.useMemo(
    () =>
      form
        ? {
            [sessionId]: {
              title: form.title,
              startsAt: form.startsAt,
              endsAt: form.endsAt,
            },
          }
        : {},
    [sessionId, form?.title, form?.startsAt, form?.endsAt],
  );

  const loadAssignments = React.useCallback(async () => {
    if (!form) return;
    setAssignmentsLoading(true);
    setAssignmentError(null);
    try {
      const rows = await fetchAssignmentsForOrg({
        sessionId,
        sessionLookup,
      });
      setAssignments(rows);
    } catch (err) {
      setAssignmentError(
        err instanceof Error ? err.message : "Failed to load assignments",
      );
    } finally {
      setAssignmentsLoading(false);
    }
  }, [sessionId, sessionLookup]);

  React.useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  React.useEffect(() => {
    if (!form?.startsAt || !form?.endsAt) {
      setStaffEligibility([]);
      return;
    }
    setStaffEligibilityLoading(true);
    fetchStaffEligibilityForSession({
      groupId: form.groupIds?.[0] ?? null,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    })
      .then(setStaffEligibility)
      .catch(() => setStaffEligibility([]))
      .finally(() => setStaffEligibilityLoading(false));
  }, [form?.groupIds, form?.startsAt, form?.endsAt]);

  const assignedStaffIds = React.useMemo(
    () => new Set(assignments.map((a) => a.staffId)),
    [assignments],
  );
  const staffOptions = React.useMemo(
    () => staffEligibility.filter((s) => !assignedStaffIds.has(s.id)),
    [staffEligibility, assignedStaffIds],
  );

  const handleChange = (
    key: keyof AdminSessionFormValues,
    value: string | string[],
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);

    const nextErrors: typeof fieldErrors = {};
    const startMs = form.startsAt ? Date.parse(form.startsAt) : NaN;
    const endMs = form.endsAt ? Date.parse(form.endsAt) : NaN;
    if (!form.title.trim()) {
      nextErrors.title = "Title is required.";
    }
    if (!form.startsAt || Number.isNaN(startMs)) {
      nextErrors.startsAt = "Enter a valid start time.";
    }
    if (!form.endsAt || Number.isNaN(endMs)) {
      nextErrors.endsAt = "Enter a valid end time.";
    } else if (!Number.isNaN(startMs) && endMs <= startMs) {
      nextErrors.endsAt = "End time must be after start time.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await updateSession(sessionId, {
        ...form,
        groupIds: form.groupIds?.filter(Boolean) ?? [],
      });
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setError("We couldn’t save this session. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/sessions/${sessionId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to session
        </Button>
      </div>

      <Card
        title="Edit session"
        description="Update details for this session."
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        {loading || !form ? (
          <div className="space-y-3">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
            <div className="h-10 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => handleChange("title", e.target.value)}
                required
              />
              {fieldErrors.title ? (
                <p className="text-xs text-status-danger">{fieldErrors.title}</p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="startsAt">Start time</Label>
                <Input
                  id="startsAt"
                  type="datetime-local"
                  value={form.startsAt}
                  onChange={(e) => handleChange("startsAt", e.target.value)}
                  required
                />
                {fieldErrors.startsAt ? (
                  <p className="text-xs text-status-danger">
                    {fieldErrors.startsAt}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="endsAt">End time</Label>
                <Input
                  id="endsAt"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(e) => handleChange("endsAt", e.target.value)}
                  required
                />
                {fieldErrors.endsAt ? (
                  <p className="text-xs text-status-danger">
                    {fieldErrors.endsAt}
                  </p>
                ) : null}
              </div>
            </div>

            <DropdownMultiSelect
              id="group"
              label="Classes / groups"
              options={groups.map((g) => ({ value: g.id, label: g.name }))}
              value={form.groupIds ?? []}
              onChange={(ids) => handleChange("groupIds", ids)}
              placeholder="Select classes…"
              helperText="Assign this session to one or more classes. Manage classes from the Classes page."
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/sessions/${sessionId}`)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating…" : "Update session"}
              </Button>
            </div>
          </form>
        )}
      </Card>

      {form && (
        <Card
          title="Assign teachers"
          description="Assign staff to this session. Eligible staff (available at this time, prefer this class) are listed first; you may still assign others."
        >
          {assignmentError ? (
            <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {assignmentError}
            </div>
          ) : null}

          {assignmentsLoading ? (
            <div className="space-y-3">
              <div className="h-4 w-48 animate-pulse rounded bg-muted" />
              <div className="h-16 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : assignments.length > 0 ? (
            <ul className="space-y-2">
              {assignments.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2"
                >
                  <span className="font-medium text-text-primary">
                    {a.staffName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{a.roleLabel}</Badge>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={removeId === a.id}
                      className="text-status-danger hover:text-status-danger"
                      onClick={async () => {
                        setRemoveId(a.id);
                        setAssignmentError(null);
                        try {
                          await deleteAssignment(a.id);
                          await loadAssignments();
                        } catch (err) {
                          setAssignmentError(
                            err instanceof Error
                              ? err.message
                              : "Failed to remove assignment",
                          );
                        } finally {
                          setRemoveId(null);
                        }
                      }}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-text-muted">
              No staff assigned yet. Add someone below.
            </p>
          )}

          <div className="mt-6 border-t border-border-subtle pt-4">
            <h3 className="mb-3 text-sm font-semibold text-text-primary">
              Add teacher
            </h3>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <DropdownMultiSelect
                  id="add-staff"
                  label="Staff (select one or more, then Add selected)"
                  options={staffOptions.map((s) => ({
                    value: s.id,
                    label: s.eligible
                      ? s.fullName
                      : `${s.fullName} — ${s.reason ? eligibilityReasonLabel[s.reason] : "Unavailable"}`,
                    title: s.reason
                      ? eligibilityReasonLabel[s.reason]
                      : undefined,
                  }))}
                  value={selectedStaffIds}
                  onChange={setSelectedStaffIds}
                  placeholder="Select staff…"
                  disabled={staffEligibilityLoading}
                />
              </div>
              <div className="w-32">
                <Label htmlFor="add-role" className="text-xs">
                  Role
                </Label>
                <select
                  id="add-role"
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value)}
                  className="mt-1 flex h-10 w-full rounded-md border border-border-subtle bg-white px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <option value="Lead">Lead</option>
                  <option value="Support">Support</option>
                </select>
              </div>
              <Button
                type="button"
                size="sm"
                disabled={selectedStaffIds.length === 0 || addSubmitting}
                onClick={async () => {
                  if (selectedStaffIds.length === 0) return;
                  setAddSubmitting(true);
                  setAssignmentError(null);
                  const toAdd = selectedStaffIds;
                  setSelectedStaffIds([]);
                  let failed = false;
                  for (const staffId of toAdd) {
                    try {
                      await createAssignment(
                        {
                          sessionId,
                          staffId,
                          role: addRole,
                          status: "confirmed",
                        },
                        { sessionLookup },
                      );
                    } catch (err) {
                      failed = true;
                      setAssignmentError(
                        err instanceof Error
                          ? err.message
                          : "Failed to add assignment",
                      );
                    }
                  }
                  if (!failed) await loadAssignments();
                  setAddSubmitting(false);
                }}
              >
                {addSubmitting ? "Adding…" : "Add selected"}
              </Button>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Eligible staff (available at this time and prefer this class) are
              selectable; others are shown with a reason but can still be
              assigned if needed.
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}

