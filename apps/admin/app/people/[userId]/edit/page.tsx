"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "@pathway/ui";
import { Checkbox } from "@/components/ui/checkbox";
import {
  fetchStaffDetailForEdit,
  fetchGroups,
  updateStaff,
  type StaffEditDetail,
  type StaffEditUpdatePayload,
} from "@/lib/api-client";
import { toast } from "sonner";

const WEEKDAYS: { value: string; label: string }[] = [
  { value: "MON", label: "Monday" },
  { value: "TUE", label: "Tuesday" },
  { value: "WED", label: "Wednesday" },
  { value: "THU", label: "Thursday" },
  { value: "FRI", label: "Friday" },
  { value: "SAT", label: "Saturday" },
  { value: "SUN", label: "Sunday" },
];

const ROLES = [
  { value: "STAFF", label: "Staff" },
  { value: "SITE_ADMIN", label: "Site Admin" },
  { value: "VIEWER", label: "Viewer" },
];

type AvailabilityRange = { day: string; startTime: string; endTime: string };

export default function EditStaffPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;

  const [staff, setStaff] = React.useState<StaffEditDetail | null>(null);
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [role, setRole] = React.useState<string>("STAFF");
  const [isActive, setIsActive] = React.useState(true);
  const [weeklyAvailability, setWeeklyAvailability] = React.useState<
    AvailabilityRange[]
  >([]);
  const [unavailableDates, setUnavailableDates] = React.useState<
    { date: string; reason?: string }[]
  >([]);
  const [preferredGroupIds, setPreferredGroupIds] = React.useState<string[]>(
    [],
  );
  const [newUnavailableDate, setNewUnavailableDate] = React.useState("");
  const [validationErrors, setValidationErrors] = React.useState<
    Record<string, string>
  >({});

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setNotFound(false);
    try {
      const [staffData, groupsData] = await Promise.all([
        fetchStaffDetailForEdit(userId),
        fetchGroups({ activeOnly: true }),
      ]);
      if (!staffData) {
        setNotFound(true);
        setStaff(null);
      } else {
        setStaff(staffData);
        setFirstName(staffData.firstName ?? "");
        setLastName(staffData.lastName ?? "");
        setRole(staffData.role);
        setIsActive(staffData.isActive);
        setWeeklyAvailability(
          staffData.weeklyAvailability.map((a) => ({
            day: a.day,
            startTime: a.startTime,
            endTime: a.endTime,
          })),
        );
        setUnavailableDates(
          staffData.unavailableDates.map((u) => ({
            date: u.date,
            reason: u.reason ?? undefined,
          })),
        );
        setPreferredGroupIds(staffData.preferredGroups.map((g) => g.id));
      }
      setGroups(groupsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load staff profile",
      );
      setStaff(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const addAvailabilityRange = () => {
    setWeeklyAvailability((prev) => [
      ...prev,
      { day: "MON", startTime: "09:00", endTime: "17:00" },
    ]);
  };

  const updateAvailabilityRange = (
    index: number,
    field: keyof AvailabilityRange,
    value: string,
  ) => {
    setWeeklyAvailability((prev) =>
      prev.map((r, i) =>
        i === index ? { ...r, [field]: value } : r,
      ),
    );
  };

  const removeAvailabilityRange = (index: number) => {
    setWeeklyAvailability((prev) => prev.filter((_, i) => i !== index));
  };

  const addUnavailableDate = () => {
    const date = newUnavailableDate.trim();
    if (!date) return;
    if (unavailableDates.some((u) => u.date === date)) return;
    setUnavailableDates((prev) => [...prev, { date }]);
    setNewUnavailableDate("");
  };

  const removeUnavailableDate = (date: string) => {
    setUnavailableDates((prev) => prev.filter((u) => u.date !== date));
  };

  const togglePreferredGroup = (groupId: string) => {
    setPreferredGroupIds((prev) =>
      prev.includes(groupId)
        ? prev.filter((id) => id !== groupId)
        : [...prev, groupId],
    );
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    for (let i = 0; i < weeklyAvailability.length; i++) {
      const r = weeklyAvailability[i];
      const start = r.startTime;
      const end = r.endTime;
      if (start >= end) {
        errs[`avail-${i}`] = "Start time must be before end time";
      }
    }
    const dayRanges = new Map<string, { start: number; end: number }[]>();
    for (const r of weeklyAvailability) {
      const startM = parseInt(r.startTime.slice(0, 2), 10) * 60 + parseInt(r.startTime.slice(3), 10);
      const endM = parseInt(r.endTime.slice(0, 2), 10) * 60 + parseInt(r.endTime.slice(3), 10);
      const existing = dayRanges.get(r.day) ?? [];
      const overlaps = existing.some(
        (o) => startM < o.end && endM > o.start,
      );
      if (overlaps) {
        errs[`overlap-${r.day}`] = `Overlapping ranges for ${WEEKDAYS.find((w) => w.value === r.day)?.label ?? r.day}`;
      }
      existing.push({ start: startM, end: endM });
      dayRanges.set(r.day, existing);
    }
    setValidationErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!staff) return;
    setValidationErrors({});
    if (!validate()) return;

    setIsSaving(true);
    setError(null);
    try {
      const payload: StaffEditUpdatePayload = {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        role: role as "SITE_ADMIN" | "STAFF" | "VIEWER",
        isActive,
      };
      if (staff.canEditAvailability) {
        payload.weeklyAvailability = weeklyAvailability.map((r) => ({
          day: r.day,
          startTime: r.startTime,
          endTime: r.endTime,
        }));
        payload.unavailableDates = unavailableDates;
        payload.preferredGroupIds = preferredGroupIds;
      }
      const updated = await updateStaff(userId, payload);
      setStaff(updated);
      toast.success("Profile saved successfully");
      router.push(`/people/${userId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href={`/people/${userId}`} className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <Card>
          <div className="h-64 animate-pulse rounded bg-muted" />
        </Card>
      </div>
    );
  }

  if (notFound || !staff) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="secondary" size="sm">
          <Link href="/people" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to people
          </Link>
        </Button>
        <Card title="Staff Not Found">
          <p className="text-sm text-text-muted">
            We couldn&apos;t find a staff profile for this person.
          </p>
        </Card>
      </div>
    );
  }

  const canEditAvailability = staff.canEditAvailability;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link
            href={`/people/${userId}`}
            className="inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to profile
          </Link>
        </Button>
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Personal details" description="Basic information about this staff member">
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="First name"
                />
              </div>
              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Last name"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="flex items-center gap-2">
                <Checkbox
                  id="isActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
              <Label htmlFor="isActive">Active</Label>
            </div>
            {staff.email && (
              <p className="text-sm text-text-muted">
                Email: {staff.email} (read-only)
              </p>
            )}
          </div>
        </Card>

        <Card
          title="Weekly availability"
          description="Recurring time slots when this staff member is available"
        >
          {!canEditAvailability ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Availability and preferences require Starter plan or above.{" "}
              <Link href="/billing" className="underline">
                Upgrade to edit
              </Link>
              .
            </div>
          ) : (
            <div className="space-y-4">
              {weeklyAvailability.map((r, i) => (
                <div
                  key={i}
                  className="flex flex-wrap items-end gap-2 rounded border border-border-subtle p-2"
                >
                  <div className="min-w-[100px]">
                    <Label className="text-xs">Day</Label>
                    <Select
                      value={r.day}
                      onChange={(e) =>
                        updateAvailabilityRange(i, "day", e.target.value)
                      }
                    >
                      {WEEKDAYS.map((w) => (
                        <option key={w.value} value={w.value}>
                          {w.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="min-w-[80px]">
                    <Label className="text-xs">Start</Label>
                    <Input
                      type="time"
                      value={r.startTime}
                      onChange={(e) =>
                        updateAvailabilityRange(i, "startTime", e.target.value)
                      }
                    />
                  </div>
                  <div className="min-w-[80px]">
                    <Label className="text-xs">End</Label>
                    <Input
                      type="time"
                      value={r.endTime}
                      onChange={(e) =>
                        updateAvailabilityRange(i, "endTime", e.target.value)
                      }
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => removeAvailabilityRange(i)}
                    className="shrink-0"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                  {(validationErrors[`avail-${i}`] ||
                    validationErrors[`overlap-${r.day}`]) && (
                    <span className="w-full text-sm text-status-danger">
                      {validationErrors[`avail-${i}`] ??
                        validationErrors[`overlap-${r.day}`]}
                    </span>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addAvailabilityRange}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add time range
              </Button>
            </div>
          )}
        </Card>

        <Card
          title="Date exceptions"
          description="Specific dates when this staff member is unavailable"
        >
          {!canEditAvailability ? (
            <p className="text-sm text-text-muted">
              Date exceptions are unavailable on this plan.
            </p>
          ) : (
            <div className="space-y-4">
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={newUnavailableDate}
                  onChange={(e) => setNewUnavailableDate(e.target.value)}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addUnavailableDate}
                >
                  Add
                </Button>
              </div>
              <ul className="space-y-1">
                {unavailableDates.map((u) => (
                  <li
                    key={u.date}
                    className="flex items-center justify-between rounded border border-border-subtle px-3 py-2 text-sm"
                  >
                    <span>{u.date}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => removeUnavailableDate(u.date)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
              {unavailableDates.length === 0 && (
                <p className="text-sm text-text-muted">
                  No blocked dates. Add a date above to mark unavailability.
                </p>
              )}
            </div>
          )}
        </Card>

        <Card
          title="Age group preferences"
          description="Preferred age groups for session assignment"
        >
          {!canEditAvailability ? (
            <p className="text-sm text-text-muted">
              Age group preferences are unavailable on this plan.
            </p>
          ) : groups.length === 0 ? (
            <p className="text-sm text-text-muted">
              No age groups defined for this site. Add groups in Settings first.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => togglePreferredGroup(g.id)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    preferredGroupIds.includes(g.id)
                      ? "border-accent-strong bg-accent-subtle text-text-primary"
                      : "border-border-subtle bg-transparent hover:border-border-strong"
                  }`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
