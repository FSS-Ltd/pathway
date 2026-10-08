"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
import { useAdminContext } from "@/lib/admin-context";
import { ArrowLeft, Plus, X } from "lucide-react";
import {
  Button,
  buttonVariants,
  Card,
  cn,
  Input,
  Label,
  Textarea,
  Select,
} from "@pathway/ui";
import {
  AdminLessonFormValues,
  createLesson,
  fetchGroups,
  fetchSessions,
  setApiClientToken,
} from "../../../lib/api-client";
import type { GroupOption } from "../../../lib/api-client";
import { toLocalDateKey } from "../../../lib/date";

const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024; // 10MB, must match API

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const startOfWeekIso = () => {
  const d = new Date();
  const day = d.getDay(); // 0 (Sun) - 6 (Sat)
  const diff = day === 0 ? -6 : 1 - day; // move to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return toLocalDateKey(d);
};

export default function NewLessonPage() {
  const router = useRouter();
  const [form, setForm] = React.useState<AdminLessonFormValues>({
    title: "",
    description: "",
    weekOf: startOfWeekIso(),
    groupId: "",
    sessionId: null,
    resources: [],
  });
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] =
    React.useState<Partial<Record<keyof AdminLessonFormValues, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [groupsError, setGroupsError] = React.useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = React.useState(true);
  const [sessions, setSessions] = React.useState<
    Array<{ id: string; label: string; startsAt: string }>
  >([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(true);
  const [uploadedFile, setUploadedFile] = React.useState<{
    name: string;
    base64: string;
    sizeInBytes: number;
  } | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputId = React.useId();
  const { state: adminState } = useAdminContext();
  const tenantId = adminState.status === "ready" ? adminState.snapshot.activeSiteId : null;
  const { data: session, status: sessionStatus } = useSession();

  React.useEffect(() => {
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
  }, [session]);

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setGroupsLoading(false);
      setSessionsLoading(false);
      return;
    }
    const loadGroups = async () => {
      setGroupsLoading(true);
      setGroupsError(null);
      try {
        const result = await fetchGroups({ activeOnly: true });
        setGroups(result);
      } catch (err) {
        setGroupsError(
          err instanceof Error ? err.message : "Failed to load groups",
        );
        setGroups([]);
      } finally {
        setGroupsLoading(false);
      }
    };
    const loadSessions = async () => {
      setSessionsLoading(true);
      try {
        const list = await fetchSessions();
        setSessions(
          list.map((s) => ({
            id: s.id,
            label: `${s.title ?? "Session"} · ${new Date(s.startsAt).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`,
            startsAt: s.startsAt,
          })),
        );
      } catch {
        setSessions([]);
      } finally {
        setSessionsLoading(false);
      }
    };
    void loadGroups();
    void loadSessions();
  }, [sessionStatus]);

  const handleFieldChange = (
    key: keyof AdminLessonFormValues,
    value: string,
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
    if (!form.weekOf) {
      nextErrors.weekOf = "Week of date is required.";
    }
    if (
      uploadedFile &&
      uploadedFile.sizeInBytes > MAX_RESOURCE_FILE_BYTES
    ) {
      setError("File must be 10 MB or smaller. Choose a smaller file.");
      return;
    }
    if (!tenantId) {
      setError("Active site required. Select a site in the top bar.");
      return;
    }
    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    const cleanedResources =
      form.resources?.map((r) => ({ label: r.label.trim() })).filter((r) => r.label) ?? [];
    setSubmitting(true);
    try {
      const primaryResource = cleanedResources[0]?.label;
      const created = await createLesson({
        ...form,
        tenantId,
        groupId: form.groupId || undefined,
        sessionId: form.sessionId ?? undefined,
        fileKey: primaryResource,
        resources: cleanedResources,
        ...(uploadedFile
          ? {
              resourceFileBase64: uploadedFile.base64,
              resourceFileName: uploadedFile.name,
            }
          : {}),
      });
      router.push(created?.id ? `/lessons/${created.id}` : "/lessons");
    } catch {
      setError("We couldn’t save this lesson. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const addResource = () => {
    setForm((prev) => ({
      ...prev,
      resources: [...(prev.resources ?? []), { label: "" }],
    }));
  };

  const updateResource = (index: number, value: string) => {
    setForm((prev) => {
      const next = [...(prev.resources ?? [])];
      next[index] = { label: value };
      return { ...prev, resources: next };
    });
  };

  const removeResource = (index: number) => {
    setForm((prev) => {
      const next = [...(prev.resources ?? [])];
      next.splice(index, 1);
      return { ...prev, resources: next };
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] ?? "" : "";
      setUploadedFile({
        name: file.name,
        base64,
        sizeInBytes: file.size,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const clearUploadedFile = () => setUploadedFile(null);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push("/lessons")}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to lessons
        </Button>
      </div>

      <Card
        title="New lesson"
        description="Capture lesson details for the timetable."
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => handleFieldChange("title", e.target.value)}
              placeholder="e.g. Year 4 Science - Habitats"
              required
            />
            {fieldErrors.title ? (
              <p className="text-xs text-status-danger">{fieldErrors.title}</p>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="sessionId">Session</Label>
              {sessionsLoading ? (
                <Input
                  id="sessionId"
                  disabled
                  placeholder="Loading sessions…"
                  className="bg-muted"
                />
              ) : (
                <Select
                  id="sessionId"
                  value={form.sessionId ?? ""}
                  onChange={(e) => {
                    const value = e.target.value || null;
                    const session = value
                      ? sessions.find((s) => s.id === value)
                      : null;
                    setForm((prev) => ({
                      ...prev,
                      sessionId: value,
                      weekOf: session
                        ? session.startsAt.slice(0, 10)
                        : prev.weekOf,
                    }));
                  }}
                >
                  <option value="">No session (set week below)</option>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              )}
              <p className="text-xs text-text-muted">
                Link this lesson to a session. Week of is set from the session when selected.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="groupId">Group / class</Label>
              {groupsLoading ? (
                <Input
                  id="groupId"
                  disabled
                  placeholder="Loading groups…"
                  className="bg-muted"
                />
              ) : (
                <Select
                  id="groupId"
                  value={form.groupId ?? ""}
                  onChange={(e) => handleFieldChange("groupId", e.target.value)}
                >
                  <option value="">Select a group…</option>
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </Select>
              )}
              {groupsError ? (
                <p className="text-xs text-status-danger">
                  {groupsError} — you can retry by refreshing the page.
                </p>
              ) : (
                <p className="text-xs text-text-muted">
                  Choose the group or class this lesson belongs to.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="weekOf">Week of</Label>
              <Input
                id="weekOf"
                type="date"
                value={form.weekOf ?? ""}
                onChange={(e) => handleFieldChange("weekOf", e.target.value)}
                required
              />
              {fieldErrors.weekOf ? (
                <p className="text-xs text-status-danger">{fieldErrors.weekOf}</p>
              ) : (
                <p className="text-xs text-text-muted">
                  Week start date (auto-filled when a session is selected).
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={form.description ?? ""}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder="Overview, learning objectives, materials…"
              rows={4}
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Resources</Label>
            <div className="space-y-2">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-text-muted">
                  Upload a file
                  {process.env.NODE_ENV !== "production" &&
                    " (stored in DB until S3; max 10MB)"}
                </span>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    id={fileInputId}
                    type="file"
                    className="sr-only"
                    onChange={handleFileChange}
                    aria-label="Upload resource file"
                  />
                  <label
                    htmlFor={fileInputId}
                    className={cn(
                      buttonVariants({ variant: "secondary", size: "sm" }),
                      "cursor-pointer",
                    )}
                  >
                    Choose file
                  </label>
                  {uploadedFile ? (
                    <>
                      <span
                        className={
                          uploadedFile.sizeInBytes <= MAX_RESOURCE_FILE_BYTES
                            ? "text-sm text-status-ok"
                            : "text-sm text-status-danger"
                        }
                      >
                        {uploadedFile.name} —{" "}
                        {formatFileSize(uploadedFile.sizeInBytes)}
                        {uploadedFile.sizeInBytes > MAX_RESOURCE_FILE_BYTES &&
                          " (over 10 MB limit)"}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        onClick={clearUploadedFile}
                        aria-label="Remove uploaded file"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              </div>
              <p className="text-xs text-text-muted">
                Or add labels only (stored as fileKey):
              </p>
              {(form.resources ?? []).map((res, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <Input
                    value={res.label}
                    onChange={(e) => updateResource(idx, e.target.value)}
                    placeholder="Resource label"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={() => removeResource(idx)}
                    aria-label="Remove resource"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={addResource}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add resource label
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => router.push("/lessons")}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating…" : "Create lesson"}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
