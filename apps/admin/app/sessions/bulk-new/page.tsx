"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { ArrowLeft } from "lucide-react";
import { Button, Card, Input, Label } from "@pathway/ui";
import { Checkbox } from "../../../components/ui/checkbox";
import { DropdownMultiSelect } from "../../../components/dropdown-multi-select";
import {
  bulkCreateSessions,
  countBulkSessions,
  fetchClasses,
  fetchStaff,
  type BulkCreateSessionsInput,
  type AdminStaffRow,
} from "../../../lib/api-client";

const DAYS: { value: BulkCreateSessionsInput["daysOfWeek"][number]; label: string }[] = [
  { value: "MON", label: "Mon" },
  { value: "TUE", label: "Tue" },
  { value: "WED", label: "Wed" },
  { value: "THU", label: "Thu" },
  { value: "FRI", label: "Fri" },
  { value: "SAT", label: "Sat" },
  { value: "SUN", label: "Sun" },
];

const defaultStartTime = "09:00";
const defaultEndTime = "10:00";

export default function BulkNewSessionsPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const [classes, setClasses] = React.useState<{ id: string; name: string }[]>(
    [],
  );
  const [staff, setStaff] = React.useState<AdminStaffRow[]>([]);
  const [groupIds, setGroupIds] = React.useState<string[]>([]);
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [daysOfWeek, setDaysOfWeek] = React.useState<
    BulkCreateSessionsInput["daysOfWeek"]
  >(["MON", "WED", "FRI"]);
  const [startTime, setStartTime] = React.useState(defaultStartTime);
  const [endTime, setEndTime] = React.useState(defaultEndTime);
  const [titlePrefix, setTitlePrefix] = React.useState("");
  const [assignmentUserIds, setAssignmentUserIds] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [groupsLoadError, setGroupsLoadError] = React.useState<string | null>(
    null,
  );

  // Only fetch classes and staff after session is ready so auth header is set
  React.useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    setGroupsLoadError(null);
    fetchClasses()
      .then((rows) => setClasses(rows.map((c) => ({ id: c.id, name: c.name }))))
      .catch((err) => {
        setGroupsLoadError(
          err instanceof Error ? err.message : "Failed to load classes",
        );
        setClasses([]);
      });
    fetchStaff()
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [sessionStatus, session]);

  const toggleDay = (day: BulkCreateSessionsInput["daysOfWeek"][number]) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };

  const sessionCountPerClass = React.useMemo(() => {
    if (!startDate || !endDate || daysOfWeek.length === 0 || !startTime)
      return 0;
    if (startDate > endDate) return 0;
    return countBulkSessions({
      startDate,
      endDate,
      daysOfWeek,
      startTime,
    });
  }, [startDate, endDate, daysOfWeek, startTime]);

  const sessionCount = sessionCountPerClass * Math.max(0, groupIds.length);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (groupIds.length === 0) {
      setError("Select at least one class / group.");
      return;
    }
    if (!startDate || !endDate) {
      setError("Enter start and end date.");
      return;
    }
    if (startDate > endDate) {
      setError("End date must be on or after start date.");
      return;
    }
    if (daysOfWeek.length === 0) {
      setError("Select at least one day of the week.");
      return;
    }
    const [sh, sm] = startTime.split(":").map(Number);
    const [eh, em] = endTime.split(":").map(Number);
    if (sh * 60 + sm >= eh * 60 + em) {
      setError("End time must be after start time.");
      return;
    }
    if (sessionCount === 0) {
      setError("No sessions would be created (dates may be in the past or none match selected days).");
      return;
    }

    setSubmitting(true);
    try {
      const result = await bulkCreateSessions({
        groupIds,
        startDate,
        endDate,
        daysOfWeek,
        startTime,
        endTime,
        titlePrefix: titlePrefix.trim() || undefined,
        assignmentUserIds:
          assignmentUserIds.length > 0 ? assignmentUserIds : undefined,
      });
      router.push("/sessions");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sessions.");
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

      <Card
        title="Bulk add sessions"
        description="Create multiple sessions for a class over a date range. Sessions in the past are skipped. You can edit each session after creation."
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DropdownMultiSelect
            label="Classes / groups"
            options={classes.map((c) => ({ value: c.id, label: c.name }))}
            value={groupIds}
            onChange={setGroupIds}
            placeholder="Select classes…"
            helperText="Sessions will be created for each selected class."
            error={groupsLoadError ?? undefined}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startDate">Start date</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endDate">End date</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Days of week</Label>
            <div className="flex flex-wrap gap-4">
              {DAYS.map((d) => (
                <label
                  key={d.value}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={daysOfWeek.includes(d.value)}
                    onChange={() => toggleDay(d.value)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="startTime">Start time</Label>
              <Input
                id="startTime"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="endTime">End time</Label>
              <Input
                id="endTime"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="titlePrefix">Title prefix (optional)</Label>
            <Input
              id="titlePrefix"
              value={titlePrefix}
              onChange={(e) => setTitlePrefix(e.target.value)}
              placeholder="e.g. Year 3 Maths"
            />
            <p className="text-xs text-text-muted">
              If set, each session title will be &quot;[prefix] YYYY-MM-DD&quot;.
            </p>
          </div>

          <DropdownMultiSelect
            id="assignments"
            label="Pre-assign teachers (optional)"
            options={staff.map((s) => ({ value: s.id, label: s.fullName }))}
            value={assignmentUserIds}
            onChange={setAssignmentUserIds}
            placeholder="Select staff…"
            helperText="Assigned staff may be unavailable for some sessions; you can adjust after creation."
          />

          <div className="rounded-lg border border-border-subtle bg-surface-alt px-4 py-3">
            <p className="font-medium text-text-primary">
              {sessionCount} session{sessionCount !== 1 ? "s" : ""} will be
              created
              {groupIds.length > 1
                ? ` (${sessionCountPerClass} per class × ${groupIds.length} classes)`
                : ""}
              .
            </p>
            <p className="text-sm text-text-muted">
              Sessions in the past are skipped. You can edit each session
              individually after creation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={submitting || sessionCount === 0}>
              {submitting ? "Creating…" : "Create sessions"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/sessions")}
            >
              Cancel
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
