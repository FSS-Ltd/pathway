"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "@/lib/use-session-compat";
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
  fetchLessonById,
  fetchGroups,
  fetchSessions,
  updateLesson,
  setApiClientToken,
  downloadLessonResource,
} from "../../../../lib/api-client";
import type { GroupOption } from "../../../../lib/api-client";
import { Download } from "lucide-react";

const MAX_RESOURCE_FILE_BYTES = 10 * 1024 * 1024; // 10MB, must match API

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function EditLessonPage() {
  const params = useParams<{ lessonId: string }>();
  const router = useRouter();
  const lessonId = params.lessonId;

  const [form, setForm] = React.useState<AdminLessonFormValues | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [fieldErrors, setFieldErrors] =
    React.useState<Partial<Record<keyof AdminLessonFormValues, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [groups, setGroups] = React.useState<GroupOption[]>([]);
  const [groupsError, setGroupsError] = React.useState<string | null>(null);
  const [groupsLoading, setGroupsLoading] = React.useState(true);
  const [legacyGroupLabel, setLegacyGroupLabel] = React.useState<string | null>(
    null,
  );
  const [currentResourceFileName, setCurrentResourceFileName] = React.useState<
    string | null
  >(null);
  const [newUploadedFile, setNewUploadedFile] = React.useState<{
    name: string;
    base64: string;
    sizeInBytes: number;
  } | null>(null);
  const [removeFileRequested, setRemoveFileRequested] = React.useState(false);
  const [downloadError, setDownloadError] = React.useState<string | null>(null);
  const [sessions, setSessions] = React.useState<
    Array<{ id: string; label: string; startsAt: string }>
  >([]);
  const [sessionsLoading, setSessionsLoading] = React.useState(true);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const fileInputId = React.useId();
  const { data: session, status: sessionStatus } = useSession();

  React.useEffect(() => {
    const token = (session as { accessToken?: string })?.accessToken ?? null;
    setApiClientToken(token);
  }, [session]);

  const handleFieldChange = (
    key: keyof AdminLessonFormValues,
    value: string,
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  React.useEffect(() => {
    if (sessionStatus !== "authenticated") {
      setLoading(false);
      return;
    }
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchLessonById(lessonId);
        if (!result) {
          setForm(null);
          setError("Lesson not found.");
        } else {
          setForm({
            title: result.title,
            description: result.description ?? "",
            weekOf: result.weekOf ? result.weekOf.slice(0, 10) : "",
            groupId: (result as any).groupId ?? "",
            sessionId: result.sessionId ?? null,
            resources: result.resources.map((r) => ({ label: r.label })),
          });
          setCurrentResourceFileName(result.resourceFileName ?? null);
          if (!(result as any).groupId && result.groupLabel) {
            setLegacyGroupLabel(result.groupLabel);
          }
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load lesson details.",
        );
        setForm(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [lessonId, sessionStatus]);

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
  }, [lessonId, sessionStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const nextErrors: typeof fieldErrors = {};
    if (!form.title.trim()) {
      nextErrors.title = "Title is required.";
    }
    if (!form.weekOf) {
      nextErrors.weekOf = "Week of date is required.";
    }
    if (
      newUploadedFile &&
      newUploadedFile.sizeInBytes > MAX_RESOURCE_FILE_BYTES
    ) {
      setError("File must be 10 MB or smaller. Choose a smaller file.");
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
      const resourcePayload =
        newUploadedFile
          ? {
              resourceFileBase64: newUploadedFile.base64,
              resourceFileName: newUploadedFile.name,
            }
          : removeFileRequested
            ? { resourceFileBase64: "", resourceFileName: null }
            : {};
      await updateLesson(lessonId, {
        ...form,
        weekOf: form.weekOf || undefined,
        groupId: form.groupId || undefined,
        sessionId: form.sessionId ?? undefined,
        fileKey: primaryResource,
        resources: cleanedResources,
        ...resourcePayload,
      });
      router.push(`/lessons/${lessonId}`);
    } catch (err) {
      setError("We couldn’t save this lesson. Try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const updateResource = (index: number, value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const next = [...(prev.resources ?? [])];
      next[index] = { label: value };
      return { ...prev, resources: next };
    });
  };

  const addResource = () => {
    setForm((prev) =>
      prev
        ? { ...prev, resources: [...(prev.resources ?? []), { label: "" }] }
        : prev,
    );
  };

  const removeResource = (index: number) => {
    setForm((prev) => {
      if (!prev) return prev;
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
      setNewUploadedFile({
        name: file.name,
        base64,
        sizeInBytes: file.size,
      });
      setRemoveFileRequested(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const handleDownload = async () => {
    setDownloadError(null);
    try {
      await downloadLessonResource(lessonId);
    } catch (err) {
      setDownloadError(
        err instanceof Error ? err.message : "Failed to download",
      );
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => router.push(`/lessons/${lessonId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to lesson
        </Button>
      </div>

      <Card
        title="Edit lesson"
        description="Update lesson details for staff."
      >
        {error ? (
          <div className="mb-4 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
            {error}
          </div>
        ) : null}

        {loading || !form ? (
          <div className="space-y-3">
            <div className="h-4 w-48 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => handleFieldChange("title", e.target.value)}
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
                      setForm((prev) =>
                        prev
                          ? {
                              ...prev,
                              sessionId: value,
                              weekOf: session
                                ? session.startsAt.slice(0, 10)
                                : prev.weekOf,
                            }
                          : prev,
                      );
                    }}
                  >
                    <option value="">No session</option>
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </Select>
                )}
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
                    onChange={(e) =>
                      handleFieldChange("groupId", e.target.value)
                    }
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
                ) : legacyGroupLabel ? (
                  <p className="text-xs text-text-muted">
                    Previously saved as “{legacyGroupLabel}”. Choose a current
                    group to update this lesson.
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
                />
                {fieldErrors.weekOf ? (
                  <p className="text-xs text-status-danger">{fieldErrors.weekOf}</p>
                ) : (
                  <p className="text-xs text-text-muted">
                    Week start (auto-filled when a session is selected).
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
                  handleFieldChange("description", e.target.value)
                }
                rows={4}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label>Resources</Label>
              <div className="space-y-2">
                {(currentResourceFileName && !removeFileRequested && !newUploadedFile) ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
                    <span className="text-sm">{currentResourceFileName}</span>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleDownload}
                      className="gap-1"
                    >
                      <Download className="h-4 w-4" />
                      Download
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRemoveFileRequested(true)}
                      className="text-status-danger"
                    >
                      Remove file
                    </Button>
                  </div>
                ) : null}
                {downloadError ? (
                  <p className="text-xs text-status-danger">{downloadError}</p>
                ) : null}
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-text-muted">
                    {currentResourceFileName || newUploadedFile
                      ? "Replace file" +
                        (process.env.NODE_ENV !== "production"
                          ? " (max 10MB)"
                          : "")
                      : "Upload a file" +
                        (process.env.NODE_ENV !== "production"
                          ? " (stored in DB until S3; max 10MB)"
                          : "")}
                  </span>
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileInputRef}
                      id={fileInputId}
                      type="file"
                      className="sr-only"
                      onChange={handleFileChange}
                      aria-label="Upload or replace resource file"
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
                    {newUploadedFile ? (
                      <>
                        <span
                          className={
                            newUploadedFile.sizeInBytes <=
                            MAX_RESOURCE_FILE_BYTES
                              ? "text-sm text-status-ok"
                              : "text-sm text-status-danger"
                          }
                        >
                          {newUploadedFile.name} —{" "}
                          {formatFileSize(newUploadedFile.sizeInBytes)}
                          {newUploadedFile.sizeInBytes >
                            MAX_RESOURCE_FILE_BYTES && " (over 10 MB limit)"}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => setNewUploadedFile(null)}
                          aria-label="Clear new file"
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : null}
                    {removeFileRequested ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveFileRequested(false)}
                      >
                        Undo remove
                      </Button>
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
                      onClick={() => removeResource(idx)}
                      aria-label="Remove resource"
                      className="h-8 w-8 p-0"
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
                onClick={() => router.push(`/lessons/${lessonId}`)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating…" : "Update lesson"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

