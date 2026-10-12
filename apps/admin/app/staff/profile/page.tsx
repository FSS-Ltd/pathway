"use client";

import * as React from "react";
import { useSession } from "@/lib/use-session-compat";
import { Card, Button, Input, Label } from "@pathway/ui";
import { Plus, Trash2 } from "lucide-react";
import { getSafeDisplayName } from "@/lib/names";
import { useAdminAccess } from "@/lib/use-admin-access";
import {
  fetchStaffProfile,
  fetchGroups,
  updateStaffProfile,
  uploadStaffAvatar,
  updateAssignmentStatus,
  setApiClientToken,
  type StaffProfileDetail,
  type StaffProfileUpdatePayload,
  type StaffUnavailableWindow,
} from "@/lib/api-client";
import { toLocalDateKey } from "@/lib/date";
import { ProfileHeaderCard } from "@/components/profile-header-card";
import { UnavailableWindowEditor } from "@/components/staff/unavailable-window-editor";
import { StaffActivityTable } from "./staff-activity-table";
import Link from "next/link";
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

function getTierLabel(role: {
  isOrgAdmin: boolean;
  isOrgOwner: boolean;
  isSiteAdmin: boolean;
}): string {
  if (role.isOrgAdmin || role.isOrgOwner) return "Admin";
  if (role.isSiteAdmin) return "Team Lead";
  return "Staff Member";
}

type AvailabilityRange = { day: string; startTime: string; endTime: string };

export default function StaffProfilePage() {
  const { data: session, status } = useSession();
  const { role } = useAdminAccess();
  const [profile, setProfile] = React.useState<StaffProfileDetail | null>(null);
  const [groups, setGroups] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [dateOfBirth, setDateOfBirth] = React.useState("");
  const [weeklyAvailability, setWeeklyAvailability] = React.useState<
    AvailabilityRange[]
  >([]);
  const [unavailableDates, setUnavailableDates] = React.useState<
    StaffUnavailableWindow[]
  >([]);
  const [preferredGroupIds, setPreferredGroupIds] = React.useState<string[]>(
    [],
  );
  const [isUploadingAvatar, setIsUploadingAvatar] = React.useState(false);
  const [avatarVersion, setAvatarVersion] = React.useState(0);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [validationErrors, setValidationErrors] = React.useState<
    Record<string, string>
  >({});
  const [actionLoadingId, setActionLoadingId] = React.useState<string | null>(
    null,
  );
  const [activityDateFrom, setActivityDateFrom] = React.useState(() => {
    return toLocalDateKey(new Date());
  });
  const [activityDateTo, setActivityDateTo] = React.useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return toLocalDateKey(d);
  });

  const filteredAssignments = React.useMemo(() => {
    const list = profile?.assignments ?? [];
    return list
      .filter((a) => {
        const dateStr = a.session?.startsAt?.slice(0, 10);
        if (!dateStr) return true;
        if (activityDateFrom && dateStr < activityDateFrom) return false;
        if (activityDateTo && dateStr > activityDateTo) return false;
        return true;
      })
      .sort((a, b) => {
        const aStart = a.session?.startsAt ?? "";
        const bStart = b.session?.startsAt ?? "";
        return aStart.localeCompare(bStart);
      });
  }, [profile?.assignments, activityDateFrom, activityDateTo]);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [profileData, groupsData] = await Promise.all([
        fetchStaffProfile(),
        fetchGroups({ activeOnly: true }),
      ]);
      setProfile(profileData);
      setFirstName(profileData.firstName ?? "");
      setLastName(profileData.lastName ?? "");
      setDisplayName(profileData.displayName ?? "");
      setDateOfBirth(profileData.dateOfBirth ?? "");
      setWeeklyAvailability(
        profileData.weeklyAvailability.map((a) => ({
          day: a.day,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
      );
      setUnavailableDates(
        profileData.unavailableDates.map((u) => ({
          date: u.date,
          startMinute: u.startMinute ?? 0,
          endMinute: u.endMinute ?? 1440,
          reason: u.reason ?? undefined,
        })),
      );
      setPreferredGroupIds(profileData.preferredGroups.map((g) => g.id));
      setGroups(groupsData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load profile");
      setProfile(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (status !== "authenticated" || !session) return;
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
    void load();
  }, [status, session, load]);

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
    if (!profile) return;
    setValidationErrors({});
    if (!validate()) return;

    setIsSaving(true);
    setError(null);
    try {
      const payload: StaffProfileUpdatePayload = {
        firstName: firstName.trim() || undefined,
        lastName: lastName.trim() || undefined,
        displayName: displayName.trim() || null,
        dateOfBirth: dateOfBirth.trim() || null,
      };
      if (profile.canEditAvailability) {
        payload.weeklyAvailability = weeklyAvailability.map((r) => ({
          day: r.day,
          startTime: r.startTime,
          endTime: r.endTime,
        }));
        payload.unavailableDates = unavailableDates;
        payload.preferredGroupIds = preferredGroupIds;
      }
      const updated = await updateStaffProfile(payload);
      setProfile((prev) => (prev ? { ...prev, ...updated } : null));
      toast.success("Profile saved successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      setError("Please choose a JPEG, PNG, or WebP image (max 5MB).");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5MB or smaller.");
      return;
    }
    setIsUploadingAvatar(true);
    setError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const match = result.match(/^data:([^;]+);base64,(.+)$/);
          resolve(match ? match[2] : result);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await uploadStaffAvatar(base64, file.type);
      // Refetch profile to get hasAvatar from server and ensure UI updates
      const updated = await fetchStaffProfile();
      setProfile(updated);
      setAvatarVersion((v) => v + 1);
      toast.success("Photo updated successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload photo");
    } finally {
      setIsUploadingAvatar(false);
      e.target.value = "";
    }
  };

  const handleAcceptAssignment = async (assignmentId: string) => {
    setActionLoadingId(assignmentId);
    try {
      await updateAssignmentStatus(assignmentId, "confirmed");
      await load();
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDeclineAssignment = async (assignmentId: string) => {
    setActionLoadingId(assignmentId);
    try {
      await updateAssignmentStatus(assignmentId, "declined");
      await load();
    } finally {
      setActionLoadingId(null);
    }
  };

  const displayNameFallback = session?.user
    ? getSafeDisplayName(session.user)
    : "User";
  const tierLabel = getTierLabel(role);
  const userImage = profile?.hasAvatar
    ? `/api/staff/profile/avatar?v=${avatarVersion}`
    : profile?.avatarUrl || (session?.user as { image?: string | null })?.image;

  if (status === "loading" || isLoading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <p className="text-text-muted">Loading…</p>
      </div>
    );
  }

  if (!session?.user) {
    return (
      <div className="rounded-lg border border-border-subtle bg-surface p-8 text-center">
        <p className="text-text-muted">Please sign in to view your profile.</p>
      </div>
    );
  }

  const canEditAvailability = profile?.canEditAvailability ?? false;
  const hasChildren = (profile?.children?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text-primary">
            Profile
          </h1>
          <p className="mt-1 text-text-muted">
            View and edit your profile details here.
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

      <div
        className="border-t border-dashed border-border-subtle"
        aria-hidden
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ProfileHeaderCard
          name={displayName || firstName || lastName || displayNameFallback}
          subtitle={tierLabel}
          avatarSrc={userImage}
          showUploadButton
          onUploadClick={() => fileInputRef.current?.click()}
          isUploading={isUploadingAvatar}
          fileInputRef={fileInputRef}
          onFileChange={handleAvatarFileChange}
        />

        {/* Bio & other details card */}
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
              <Label htmlFor="displayName">Display name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Display name"
                className="mt-1"
              />
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
            {profile?.email && (
              <div className="sm:col-span-2">
                <Label>Email</Label>
                <p className="mt-1 text-sm text-text-muted">
                  {profile.email} (read-only)
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Weekly availability */}
      {canEditAvailability && (
        <Card
          id="weekly-availability"
          title="Weekly availability"
          description="Recurring time slots when you are available"
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
      )}

      {canEditAvailability && (
        <Card
          title="Date exceptions"
          description="Choose whole days or specific hours when you are unavailable"
        >
          <UnavailableWindowEditor
            value={unavailableDates}
            onChange={setUnavailableDates}
            disabled={isSaving}
          />
        </Card>
      )}

      {/* Class preferences */}
      <Card className="p-6">
        <h2 className="text-lg font-bold text-text-primary">
          Class preferences
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Preferred classes for session assignment
        </p>
        {!canEditAvailability ? (
          <p className="mt-4 text-sm text-text-muted">
            Class preferences are unavailable on this plan.
          </p>
        ) : groups.length === 0 ? (
          <p className="mt-4 text-sm text-text-muted">
            No classes defined for this site. Add groups in Settings first.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
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

      {/* My Activity */}
      <Card className="overflow-hidden p-6">
        <h2 className="text-lg font-bold text-text-primary">My Activity</h2>
        <p className="mt-1 text-sm text-text-muted">
          Sessions you are assigned to and pending requests
        </p>
        <div className="mt-4 flex flex-wrap items-end gap-3 sm:gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="activity-from" className="text-xs">
              From
            </Label>
            <Input
              id="activity-from"
              type="date"
              value={activityDateFrom}
              onChange={(e) => setActivityDateFrom(e.target.value)}
              className="max-w-[10rem]"
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <Label htmlFor="activity-to" className="text-xs">
              To
            </Label>
            <Input
              id="activity-to"
              type="date"
              value={activityDateTo}
              onChange={(e) => setActivityDateTo(e.target.value)}
              className="max-w-[10rem]"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              const d = new Date();
              const from = toLocalDateKey(d);
              d.setMonth(d.getMonth() + 3);
              const to = toLocalDateKey(d);
              setActivityDateFrom(from);
              setActivityDateTo(to);
            }}
          >
            Reset to today
          </Button>
        </div>
        <div className="mt-4">
          <StaffActivityTable
            assignments={filteredAssignments}
            hasAssignments={Boolean(profile?.assignments?.length)}
            busyId={actionLoadingId}
            filterKey={`${activityDateFrom}:${activityDateTo}`}
            onAccept={(id) => void handleAcceptAssignment(id)}
            onDecline={(id) => void handleDeclineAssignment(id)}
          />
        </div>
      </Card>

      {/* Children section - only if user has children */}
      {hasChildren && (
        <Card className="p-6">
          <h2 className="text-lg font-bold text-text-primary">My Children</h2>
          <p className="mt-1 text-sm text-text-muted">
            Children linked to your account
          </p>
          <ul className="mt-4 space-y-2">
            {profile?.children?.map((c) => (
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
    </div>
  );
}
