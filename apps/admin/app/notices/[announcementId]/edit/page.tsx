"use client";

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card, Input, Label, Select, Textarea } from "@pathway/ui";
import { Checkbox } from "../../../../components/ui/checkbox";
import {
  AdminAnnouncementFormValues,
  AdminAnnouncementDetail,
  fetchAnnouncementById,
  updateAnnouncement,
} from "../../../../lib/api-client";

type AudienceOption = "ALL" | "PARENTS" | "STAFF";
type SendMode = "draft" | "now" | "schedule";

const PRIMARY_HEX = "#0ec2a2";

function StyledRadio({
  id,
  name,
  label,
  checked,
  onChange,
}: {
  id: string;
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary"
    >
      <input
        id={id}
        name={name}
        type="radio"
        checked={checked}
        onChange={onChange}
        className="sr-only peer"
      />
      <span
        className="flex h-4 w-4 items-center justify-center rounded-full border"
        style={{ borderColor: PRIMARY_HEX }}
      >
        <span
          className="flex h-2.5 w-2.5 items-center justify-center rounded-full transition-all peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2"
          style={{
            backgroundColor: checked ? PRIMARY_HEX : "white",
            outlineColor: PRIMARY_HEX,
          }}
        >
          {checked ? (
            <span className="block h-1.5 w-1.5 rounded-full bg-white" />
          ) : null}
        </span>
      </span>
      {label}
    </label>
  );
}

function StyledCheckbox({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="inline-flex cursor-pointer items-center gap-2 text-sm text-text-primary"
    >
      <Checkbox
        id={id}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

const audienceFromLabel = (label?: string | null): AudienceOption => {
  if (!label) return "ALL";
  const l = label.toLowerCase();
  if (l.includes("parent")) return "PARENTS";
  if (l.includes("staff")) return "STAFF";
  return "ALL";
};

const sendModeFromDetail = (
  detail: AdminAnnouncementDetail,
): { mode: SendMode; scheduledAt?: string } => {
  if (detail.status === "scheduled" || detail.scheduledAt) {
    return { mode: "schedule", scheduledAt: detail.scheduledAt ?? undefined };
  }
  if (detail.status === "sent") return { mode: "now" };
  return { mode: "draft" };
};

export default function EditNoticePage() {
  const params = useParams<{ announcementId: string }>();
  const router = useRouter();
  const announcementId = params.announcementId;

  const [form, setForm] = React.useState<AdminAnnouncementFormValues | null>(
    null,
  );
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<
    Partial<Record<keyof AdminAnnouncementFormValues, string>>
  >({});
  const [loading, setLoading] = React.useState(true);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const detail = await fetchAnnouncementById(announcementId);
        if (!detail) {
          setError("Notice not found.");
          setForm(null);
        } else {
          const delivery = sendModeFromDetail(detail);
          setForm({
            title: detail.title ?? "",
            body: detail.body ?? "",
            audience: audienceFromLabel(detail.audienceLabel),
            sendMode: delivery.mode,
            scheduledAt: delivery.scheduledAt ?? "",
            channels: detail.channels ?? ["in-app"],
          });
        }
      } catch {
        setError("We couldn’t load this notice. Try again.");
        setForm(null);
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [announcementId]);

  const handleFieldChange = (
    key: keyof AdminAnnouncementFormValues,
    value: string,
  ) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setError(null);
    const nextErrors: typeof fieldErrors = {};
    if (!form.title.trim()) nextErrors.title = "Title is required.";
    if (!form.body.trim()) nextErrors.body = "Body is required.";
    if (form.sendMode === "schedule") {
      const scheduledMs = Date.parse(form.scheduledAt ?? "");
      if (!form.scheduledAt || Number.isNaN(scheduledMs)) {
        nextErrors.scheduledAt = "Pick a valid schedule time.";
      } else if (scheduledMs <= Date.now()) {
        nextErrors.scheduledAt = "Scheduled time must be in the future.";
      }
    }
    const selectedChannels = form.channels ?? [];
    if (selectedChannels.length === 0) {
      nextErrors.channels = "Select at least one channel.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      await updateAnnouncement(announcementId, {
        ...form,
        scheduledAt:
          form.sendMode === "schedule" ? form.scheduledAt : undefined,
      });
      router.push(`/notices/${announcementId}`);
    } catch {
      setError("We couldn’t save this notice. Try again.");
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
          onClick={() => router.push(`/notices/${announcementId}`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to notice
        </Button>
      </div>

      <Card
        title="Edit notice"
        description="Send or schedule updates for parents and staff."
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
                <p className="text-xs text-status-danger">
                  {fieldErrors.title}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="body">Body</Label>
              <Textarea
                id="body"
                value={form.body}
                onChange={(e) => handleFieldChange("body", e.target.value)}
                rows={6}
                required
              />
              {fieldErrors.body ? (
                <p className="text-xs text-status-danger">{fieldErrors.body}</p>
              ) : null}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="audience">Audience</Label>
                <Select
                  id="audience"
                  value={form.audience}
                  onChange={(e) =>
                    handleFieldChange(
                      "audience",
                      e.target.value as AudienceOption,
                    )
                  }
                >
                  <option value="ALL">Parents & staff</option>
                  <option value="PARENTS">Parents / guardians</option>
                  <option value="STAFF">Staff</option>
                </Select>
              </div>

              <div className="flex flex-col gap-2">
                <Label>Delivery</Label>
                <div className="flex flex-col gap-2 text-sm text-text-primary">
                  <StyledRadio
                    id="send-draft"
                    name="sendMode"
                    label="Save as draft"
                    checked={form.sendMode === "draft"}
                    onChange={() => handleFieldChange("sendMode", "draft")}
                  />
                  <StyledRadio
                    id="send-now"
                    name="sendMode"
                    label="Send now"
                    checked={form.sendMode === "now"}
                    onChange={() => handleFieldChange("sendMode", "now")}
                  />
                  <StyledRadio
                    id="send-schedule"
                    name="sendMode"
                    label="Schedule"
                    checked={form.sendMode === "schedule"}
                    onChange={() => handleFieldChange("sendMode", "schedule")}
                  />
                  {form.sendMode === "schedule" ? (
                    <Input
                      type="datetime-local"
                      value={form.scheduledAt ?? ""}
                      onChange={(e) =>
                        handleFieldChange("scheduledAt", e.target.value)
                      }
                    />
                  ) : null}
                  {fieldErrors.scheduledAt ? (
                    <p className="text-xs text-status-danger">
                      {fieldErrors.scheduledAt}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Channels</Label>
              <div className="flex flex-wrap gap-3 text-sm text-text-primary">
                <StyledCheckbox
                  id="channel-email"
                  label="Email"
                  checked={form.channels?.includes("email") ?? false}
                  onChange={(checked) =>
                    setForm((prev) => {
                      if (!prev) return prev;
                      const next = new Set(prev.channels ?? []);
                      if (checked) next.add("email");
                      else next.delete("email");
                      setFieldErrors((fe) => ({
                        ...fe,
                        channels: undefined,
                      }));
                      return { ...prev, channels: Array.from(next) };
                    })
                  }
                />
                <StyledCheckbox
                  id="channel-inapp"
                  label="In-app"
                  checked={form.channels?.includes("in-app") ?? true}
                  onChange={(checked) =>
                    setForm((prev) => {
                      if (!prev) return prev;
                      const next = new Set(prev.channels ?? []);
                      if (checked) next.add("in-app");
                      else next.delete("in-app");
                      setFieldErrors((fe) => ({
                        ...fe,
                        channels: undefined,
                      }));
                      return { ...prev, channels: Array.from(next) };
                    })
                  }
                />
                <span className="text-xs text-text-muted">
                  Channels are advisory; backend delivery rules still apply.
                </span>
              </div>
              {fieldErrors.channels ? (
                <p className="text-xs text-status-danger">
                  {fieldErrors.channels}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/notices/${announcementId}`)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Updating…" : "Update notice"}
              </Button>
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}
