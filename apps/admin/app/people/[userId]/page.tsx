"use client";

import React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Mail, Plus, Trash2 } from "lucide-react";
import { Badge, Button, Card, Input, Label, Select } from "@pathway/ui";
import { Checkbox } from "../../../components/ui/checkbox";
import { ProfileHeaderCard } from "../../../components/profile-header-card";
import { canAccessAdminSection } from "../../../lib/access";
import { useAdminAccess } from "../../../lib/use-admin-access";
import {
  exportAttendanceCsv,
  fetchStaffDetailForEdit,
  fetchGroups,
  updateStaff,
  type StaffEditDetail,
  type StaffEditUpdatePayload,
} from "../../../lib/api-client";
import { toLocalDateKey } from "../../../lib/date";
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

const statusTone: Record<string, "success" | "default" | "warning"> = {
  active: "success",
  inactive: "default",
  unknown: "warning",
};

type AvailabilityRange = { day: string; startTime: string; endTime: string };

export default function StaffDetailPage() {
  const params = useParams<{ userId: string }>();
  const router = useRouter();
  const userId = params.userId;

  const [staff, setStaff] = React.useState<StaffEditDetail | null>(null);
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportFrom, setExportFrom] = React.useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return toLocalDateKey(d);
  });
  const [exportTo, setExportTo] = React.useState(() =>
    toLocalDateKey(new Date()),
  );

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [hasServeAccess, setHasServeAccess] = React.useState(false);
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

  const { role: userRole, isLoading: isLoadingAccess } = useAdminAccess();
  const isAdmin = canAccessAdminSection(userRole);

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
        setDateOfBirth(staffData.dateOfBirth ?? "");
        setHasServeAccess(staffData.hasServeAccess ?? false);
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
        err instanceof Error ? err.message : "Failed to load profile",
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
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)),
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
      if (r.startTime >= r.endTime) {
        errs[`avail-${i}`] = "Start time must be before end time";
      }
    }
    const dayRanges = new Map<string, { start: number; end: number }[]>();
    for (const r of weeklyAvailability) {
      const startM =
        parseInt(r.startTime.slice(0, 2), 10) * 60 +
        parseInt(r.startTime.slice(3), 10);
      const endM =
        parseInt(r.endTime.slice(0, 2), 10) * 60 +
        parseInt(r.endTime.slice(3), 10);
      const existing = dayRanges.get(r.day) ?? [];
      const overlaps = existing.some((o) => startM < o.end && endM > o.start);
      if (overlaps) {
        errs[`overlap-${r.day}`] = `Overlapping ranges for ${
          WEEKDAYS.find((w) => w.value === r.day)?.label ?? r.day
        }`;
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
        dateOfBirth: dateOfBirth.trim() || null,
        hasServeAccess: userRole.isOrgAdmin ? hasServeAccess : undefined,
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
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save changes",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="secondary" size="sm">
          <Link href="/people" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to people
          </Link>
        </Button>
        <Button variant="secondary" size="sm" onClick={load}>
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card className="p-4">
            <div className="flex flex-col items-center gap-4">
              <div className="h-6 w-48 animate-pulse rounded bg-muted" />
              <div className="h-32 w-32 animate-pulse rounded-full bg-muted" />
            </div>
          </Card>
          <Card className="p-6">
            <div className="h-4 w-64 animate-pulse rounded bg-muted" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
            </div>
          </Card>
        </div>
      ) : notFound ? (
        <Card title="Staff Member Not Found">
          <p className="text-sm text-text-muted">
            We couldn't find a staff profile for id <strong>{userId}</strong>.
          </p>
          <div className="mt-4">
            <Button variant="secondary" onClick={() => router.push("/people")}>
              Back to people
            </Button>
          </div>
        </Card>
      ) : error && !staff ? (
        <Card title="Something Went Wrong">
          <p className="text-sm text-text-muted">{error}</p>
          <div className="mt-4 flex items-center gap-2">
            <Button variant="secondary" onClick={() => router.push("/people")}>
              Back
            </Button>
            <Button onClick={load}>Retry</Button>
          </div>
        </Card>
      ) : staff ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-text-primary">
                Profile
              </h1>
              <p className="mt-1 text-text-muted">
                View and edit staff member details here.
              </p>
            </div>
            <Button size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving…" : "Save changes"}
            </Button>
          </div>

          {error && (
            <div className="rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
              {error}
            </div>
          )}

          <div className="border-t border-dashed border-border-subtle" aria-hidden />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ProfileHeaderCard
              name={
                staff.displayName ||
                staff.fullName ||
                `${firstName} ${lastName}`.trim() ||
                "Unknown"
              }
              subtitle={
                role === "SITE_ADMIN"
                  ? "Team Lead"
                  : role === "VIEWER"
                    ? "Viewer"
                    : "Staff Member"
              }
              avatarSrc={undefined}
              badges={
                <Badge
                  variant={statusTone[isActive ? "active" : "inactive"]}
                >
                  {isActive ? "Active" : "Inactive"}
                </Badge>
              }
            />
            <Card className="p-6">
              <h2 className="text-lg font-bold text-text-primary">
                Bio & other details
              </h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="First name"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="Last name"
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Display name</Label>
                  <p className="mt-1 text-sm text-text-muted">
                    {staff.displayName ?? "—"}
                  </p>
                </div>
                <div>
                  <Label htmlFor="dateOfBirth">Date of birth</Label>
                  <Input
                    id="dateOfBirth"
                    type="date"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="mt-1"
                  />
                </div>
                {userRole.isOrgAdmin && (
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="hasServeAccess"
                      checked={hasServeAccess}
                      onChange={(e) => setHasServeAccess(e.target.checked)}
                    />
                    <Label htmlFor="hasServeAccess">Has serve access</Label>
                  </div>
                )}
                <div>
                  <Label htmlFor="role">Role</Label>
                  <Select
                    id="role"
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="mt-1"
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
                  <div className="sm:col-span-2">
                    <Label>Email</Label>
                    <p className="mt-1 text-sm text-text-muted">
                      {staff.email} (read-only)
                    </p>
                  </div>
                )}
              </div>
            </Card>
          </div>

          {staff.canEditAvailability && (
            <>
              <Card
                title="Weekly availability"
                description="Recurring time slots when this staff member is available"
              >
                <div className="space-y-4">
                  {weeklyAvailability.map((r, i) => (
                    <div
                      key={i}
                      className="flex flex-wrap items-end gap-2 rounded border border-border-subtle p-2"
                    >
                      <div className="min-w-[100px]">
                        <Label className="text-xs">Day</Label>
                        <select
                          value={r.day}
                          onChange={(e) =>
                            updateAvailabilityRange(i, "day", e.target.value)
                          }
                          className="mt-1 block w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm"
                        >
                          {WEEKDAYS.map((w) => (
                            <option key={w.value} value={w.value}>
                              {w.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[80px]">
                        <Label className="text-xs">Start</Label>
                        <Input
                          type="time"
                          value={r.startTime}
                          onChange={(e) =>
                            updateAvailabilityRange(i, "startTime", e.target.value)
                          }
                          className="mt-1"
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
                          className="mt-1"
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
              </Card>

              <Card
                title="Date exceptions"
                description="Specific dates when this staff member is unavailable"
              >
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
              </Card>
            </>
          )}

          {/* Children section - only if staff has linked children */}
          {(staff.children?.length ?? 0) > 0 && (
            <Card className="p-6">
              <h2 className="text-lg font-bold text-text-primary">Children</h2>
              <p className="mt-1 text-sm text-text-muted">
                Children linked to this user&apos;s account
              </p>
              <ul className="mt-4 space-y-2">
                {staff.children?.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between rounded border border-border-subtle px-3 py-2"
                  >
                    <span className="font-medium text-text-primary">
                      {c.preferredName || `${c.firstName} ${c.lastName}`}
                      {c.group && (
                        <span className="ml-2 text-sm font-normal text-text-muted">
                          — {c.group.name}
                        </span>
                      )}
                    </span>
                    <Button asChild variant="secondary" size="sm">
                      <Link href={`/children/${c.id}`}>View</Link>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card
            title="Class preferences"
            description="Preferred classes for session assignment"
          >
            {!staff.canEditAvailability ? (
              <p className="text-sm text-text-muted">
                Class preferences are unavailable on this plan.
              </p>
            ) : groups.length === 0 ? (
              <p className="text-sm text-text-muted">
                No classes defined for this site. Add groups in Settings first.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => togglePreferredGroup(g.id)}
                    disabled={!staff.canEditAvailability}
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

          {isAdmin && (
            <Card
              title="Export schedule & presence"
              description="Download this staff member's assignments and presence for a date range."
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
                <div className="flex flex-col gap-1">
                  <Label htmlFor="staff-export-from">From</Label>
                  <Input
                    id="staff-export-from"
                    type="date"
                    value={exportFrom}
                    onChange={(e) => setExportFrom(e.target.value)}
                    className="w-40"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor="staff-export-to">To</Label>
                  <Input
                    id="staff-export-to"
                    type="date"
                    value={exportTo}
                    onChange={(e) => setExportTo(e.target.value)}
                    className="w-40"
                  />
                </div>
                <Button
                  size="sm"
                  disabled={exporting}
                  onClick={async () => {
                    setExporting(true);
                    try {
                      await exportAttendanceCsv({
                        scope: "staff",
                        id: userId,
                        from: exportFrom,
                        to: exportTo,
                      });
                    } finally {
                      setExporting(false);
                    }
                  }}
                >
                  <Download className="mr-1 h-4 w-4" />
                  {exporting ? "Exporting…" : "Export CSV"}
                </Button>
              </div>
            </Card>
          )}
        </div>
      ) : null}
    </div>
  );
}
