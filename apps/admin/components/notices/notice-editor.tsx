"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, Card, Input, Label, Select, Textarea } from "@pathway/ui";
import {
  createNoticeDraft,
  fetchNoticeDraft,
  previewNoticeAudience,
  publishNotice,
  updateNoticeDraft,
  type NoticeAudience,
  type NoticeAudiencePreview,
  type NoticeDraftInput,
} from "@/lib/ace-notice-api";
import { requestFailure } from "@/lib/request-error";
import { useAdminAccess } from "@/lib/use-admin-access";
import { hasPermission } from "@/lib/access";

type FormState = {
  title: string;
  body: string;
  audience: NoticeAudience;
  expiresAtLocal: string;
};

const emptyForm: FormState = {
  title: "",
  body: "",
  audience: "STAFF",
  expiresAtLocal: "",
};

function localDateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function validate(form: FormState): NoticeDraftInput {
  const title = form.title.trim();
  const body = form.body.trim();
  if (!title || title.length > 200) {
    throw new Error("Enter a title of 1 to 200 characters.");
  }
  if (!body || body.length > 20_000) {
    throw new Error("Enter a message of 1 to 20,000 characters.");
  }
  const expiryDate = form.expiresAtLocal ? new Date(form.expiresAtLocal) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) {
    throw new Error("Enter a valid expiry date and time.");
  }
  const expiresAt = expiryDate?.toISOString() ?? null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new Error("Expiry must be in the future.");
  }
  return { title, body, audience: form.audience, expiresAt };
}

export function NoticeEditor({ draftId }: { draftId?: string }) {
  const router = useRouter();
  const { permissions } = useAdminAccess();
  const canPublish = hasPermission(permissions, "notices.publish");
  const [id, setId] = React.useState(draftId ?? null);
  const [revision, setRevision] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<FormState>(emptyForm);
  const [preview, setPreview] = React.useState<NoticeAudiencePreview | null>(
    null,
  );
  const [loading, setLoading] = React.useState(Boolean(draftId));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(true);
  const [loadRevision, setLoadRevision] = React.useState(0);

  React.useEffect(() => {
    if (!draftId) return;
    let active = true;
    void fetchNoticeDraft(draftId)
      .then((draft) => {
        if (!active) return;
        setForm({
          title: draft.title,
          body: draft.body,
          audience: draft.audience,
          expiresAtLocal: localDateTime(draft.expiresAt),
        });
        setRevision(draft.updatedAt);
        setDirty(false);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(requestFailure(cause, "Unable to load draft.").message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [draftId, loadRevision]);

  function change<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setPreview(null);
    setSuccess(null);
  }

  async function save(): Promise<string> {
    const input = validate(form);
    const draft =
      id && revision
        ? await updateNoticeDraft(id, input, revision)
        : await createNoticeDraft(input);
    setId(draft.id);
    setRevision(draft.updatedAt);
    setDirty(false);
    setSuccess("Draft saved.");
    return draft.id;
  }

  async function act(action: "save" | "preview" | "publish") {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (action === "publish") {
        if (!id || !preview || dirty) return;
        await publishNotice(id, preview);
        router.push(`/notices/${id}`);
        return;
      }
      const savedId = dirty || !id ? await save() : id;
      if (action === "save" && !dirty) setSuccess("Draft already saved.");
      if (action === "preview") {
        const result = await previewNoticeAudience(savedId);
        setPreview(result);
        setSuccess(null);
      }
    } catch (cause) {
      setPreview(null);
      setError(
        requestFailure(
          cause,
          action === "save"
            ? "Unable to save notice."
            : action === "preview"
              ? "Unable to review the audience."
              : "Unable to publish notice.",
        ).message,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5">
      <div>
        <Link
          href="/notices"
          className="text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
        >
          Back to notices
        </Link>
        <h1 className="mt-3 font-heading text-2xl font-semibold text-text-primary">
          {draftId ? "Edit notice draft" : "New notice"}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          {canPublish
            ? "Save a draft, review the current audience, then publish it to this site."
            : "Save this notice as a draft for an authorised publisher."}
        </p>
      </div>
      <Card>
        {loading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading draft…
          </p>
        ) : draftId && !revision ? (
          <div className="space-y-3">
            <p role="alert" className="text-sm text-status-danger">
              {error ?? "Unable to load this draft."}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setLoading(true);
                setError(null);
                setLoadRevision((value) => value + 1);
              }}
            >
              Retry
            </Button>
          </div>
        ) : (
          <form
            className="space-y-5"
            onSubmit={(event) => {
              event.preventDefault();
              void act("save");
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="notice-title">Title</Label>
              <Input
                id="notice-title"
                required
                maxLength={200}
                value={form.title}
                onChange={(event) => change("title", event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notice-body">Message</Label>
              <Textarea
                id="notice-body"
                required
                maxLength={20_000}
                rows={10}
                value={form.body}
                onChange={(event) => change("body", event.target.value)}
              />
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notice-audience">Audience</Label>
                <Select
                  id="notice-audience"
                  value={form.audience}
                  onChange={(event) =>
                    change("audience", event.target.value as NoticeAudience)
                  }
                >
                  <option value="PARENTS_AND_STAFF">Parents and staff</option>
                  <option value="PARENTS">Parents</option>
                  <option value="STAFF">Staff</option>
                </Select>
                {form.audience !== "STAFF" ? (
                  <p className="text-xs text-text-muted">
                    Parent notices can be drafted now. Publishing awaits the
                    family inbox.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-expiry">Expires (optional)</Label>
                <Input
                  id="notice-expiry"
                  type="datetime-local"
                  value={form.expiresAtLocal}
                  onChange={(event) =>
                    change("expiresAtLocal", event.target.value)
                  }
                />
              </div>
            </div>
            {error ? (
              <p role="alert" className="text-sm text-status-danger">
                {error}
              </p>
            ) : null}
            {id && !draftId ? (
              <Link
                href={`/notices/${id}`}
                className="text-sm font-medium text-accent-strong underline-offset-4 hover:underline"
              >
                View saved draft
              </Link>
            ) : null}
            {success ? (
              <p role="status" className="text-sm text-status-success">
                {success}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-3 border-t border-border-subtle pt-5">
              <Button type="submit" variant="secondary" disabled={pending}>
                {pending ? "Working…" : "Save draft"}
              </Button>
              {canPublish ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => void act("preview")}
                >
                  Review audience
                </Button>
              ) : null}
            </div>
          </form>
        )}
      </Card>
      {preview && canPublish ? (
        <Card title="Ready to publish">
          <p className="text-sm text-text-primary">
            {preview.recipientCount} eligible{" "}
            {preview.recipientCount === 1 ? "person" : "people"} at this site.
            {form.audience !== "STAFF"
              ? " The family inbox is not available yet, so this draft cannot be published here."
              : preview.recipientCount > 0
                ? " Publication makes this notice available in their in-app inbox."
                : " No one can receive this notice yet. Check site memberships or guardian access before publishing."}
          </p>
          <Button
            type="button"
            className="mt-4"
            disabled={
              pending ||
              preview.recipientCount === 0 ||
              form.audience !== "STAFF"
            }
            onClick={() => void act("publish")}
          >
            {pending ? "Publishing…" : "Publish notice"}
          </Button>
        </Card>
      ) : null}
    </main>
  );
}
