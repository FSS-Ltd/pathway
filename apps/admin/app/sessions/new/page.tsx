"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import { DropdownMultiSelect } from "../../../components/dropdown-multi-select";
import { SessionRotaKindField } from "../../../components/session-rota-kind";
import {
  AdminSessionFormValues,
  createSession,
  createAssignment,
  fetchGroups,
  fetchStaffEligibilityForSession,
  type GroupOption,
  type StaffEligibilityRow,
} from "../../../lib/api-client";

const eligibilityReasonLabel: Record<
  NonNullable<StaffEligibilityRow["reason"]>,
  string
> = {
  unavailable_at_time: "Unavailable at this time",
  does_not_prefer_group: "Does not prefer this age group",
  blocked_on_date: "Blocked on this date",
};

const defaultStart = () => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  return now.toISOString().slice(0, 16);
};

const defaultEnd = () => {
  const end = new Date();
  end.setHours(end.getHours() + 1);
  end.setMinutes(0, 0, 0);
  return end.toISOString().slice(0, 16);
};

export default function NewSessionPage() {
  const router = useRouter();
  const { status: sessionStatus } = useSession();
  const [form, setForm] = React.useState<AdminSessionFormValues>({
    title: "",
    rotaKind: "STANDARD",
    startsAt: defaultStart(),
    endsAt: defaultEnd(),
    groupIds: [],
  });
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof AdminSessionFormValues, string>>
  >({});
  const [submitting, setSubmitting] = React.useState(false);

  const [staffEligibility, setStaffEligibility] = React.useState<
    StaffEligibilityRow[]
  >([]);
  const [staffEligibilityLoading, setStaffEligibilityLoading] =
    React.useState(false);
  const [staffToAssign, setStaffToAssign] = React.useState<
    { staffId: string; role: string; fullName: string }[]
  >([]);
  const [selectedStaffIds, setSelectedStaffIds] = React.useState<string[]>([]);
  const [addRole, setAddRole] = React.useState("Lead");

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    fetchGroups({ activeOnly: true })
      .then(setGroups)
      .catch(() => setGroups([]));
  }, [sessionStatus]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") return;
    if (!form.startsAt || !form.endsAt) {
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
  }, [sessionStatus, form.groupIds, form.startsAt, form.endsAt]);

  const staffOptions = React.useMemo(() => {
    const assigned = new Set(staffToAssign.map((s) => s.staffId));
    return staffEligibility.filter((s) => !assigned.has(s.id));
  }, [staffEligibility, staffToAssign]);

  const handleChange = (
    key: keyof AdminSessionFormValues,
    value: string | string[],
  ) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const nextErrors: typeof fieldErrors = {};
    if (!form.title.trim()) {
      nextErrors.title = "Title is required.";
    }
    const startMs = Date.parse(form.startsAt);
    const endMs = Date.parse(form.endsAt);
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
      const created = await createSession({
        ...form,
        groupIds: form.groupIds?.filter(Boolean) ?? [],
      });
      const sessionId = created?.id;
      // Use staff from "Add selected" list, or current multi-select if user didn't click Add selected
      const staffToCreate =
        staffToAssign.length > 0
          ? staffToAssign
          : selectedStaffIds.map((staffId) => {
              const staff = staffEligibility.find((s) => s.id === staffId);
              return {
                staffId,
                role: addRole,
                fullName: staff?.fullName ?? staffId,
              };
            });
      if (sessionId && staffToCreate.length > 0) {
        const sessionLookup = {
          [sessionId]: {
            title: form.title,
            rotaKind: form.rotaKind,
            startsAt: form.startsAt,
            endsAt: form.endsAt,
          },
        };
        const assignmentErrors: string[] = [];
        for (const { staffId, role } of staffToCreate) {
          try {
            await createAssignment(
              { sessionId, staffId, role, status: "pending" },
              { sessionLookup },
            );
          } catch {
            assignmentErrors.push(
              staffToCreate.find((s) => s.staffId === staffId)?.fullName ??
                staffId,
            );
          }
        }
        if (assignmentErrors.length > 0) {
          setError(
            `Session created. Some staff could not be assigned: ${assignmentErrors.join(", ")}. Add them from the session page.`,
          );
          router.push(`/sessions/${sessionId}`);
          return;
        }
      }
      router.push(sessionId ? `/sessions/${sessionId}` : "/sessions");
    } catch {
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
          onClick={() => router.push("/sessions")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to sessions
        </Button>
      </div>

      <Card title="New session" description="Create a new session in the rota.">
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <SessionRotaKindField
            value={form.rotaKind ?? "STANDARD"}
            onChange={(value) => handleChange("rotaKind", value)}
          />
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
              placeholder="e.g. Year 3 Maths"
              required
            />
            {fieldErrors.title ? (
              <p className="text-xs text-status-danger">{fieldErrors.title}</p>
            ) : (
              <p className="text-xs text-text-muted">
                A short label shown to staff on their rota.
              </p>
            )}
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
            helperText="Optional for cover and meetings. Assign teaching sessions to classes from the Classes page."
          />

          <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Assign staff (optional)
            </h3>
            <p className="text-xs text-text-muted">
              Select staff and click Create session to assign them (pending); or
              use Add selected to add multiple roles, then Create session.
              Assigned staff receive an email to accept the shift.
            </p>
            {staffToAssign.length > 0 ? (
              <ul className="space-y-2">
                {staffToAssign.map((s) => (
                  <li
                    key={s.staffId}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-surface-alt px-3 py-2"
                  >
                    <span className="font-medium text-text-primary">
                      {s.fullName}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">{s.role}</Badge>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-status-danger hover:text-status-danger"
                        onClick={() =>
                          setStaffToAssign((prev) =>
                            prev.filter((x) => x.staffId !== s.staffId),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
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
                variant="secondary"
                size="sm"
                disabled={selectedStaffIds.length === 0}
                onClick={() => {
                  if (selectedStaffIds.length === 0) return;
                  const toAdd = selectedStaffIds.map((staffId) => {
                    const staff = staffEligibility.find(
                      (s) => s.id === staffId,
                    );
                    return {
                      staffId,
                      role: addRole,
                      fullName: staff?.fullName ?? staffId,
                    };
                  });
                  setStaffToAssign((prev) => prev.concat(toAdd));
                  setSelectedStaffIds([]);
                }}
              >
                Add selected
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/sessions")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create session"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
