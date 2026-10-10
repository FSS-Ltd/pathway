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
  scheduleNotice,
  updateNoticeDraft,
  type NoticeAudience,
  type NoticeAudiencePreview,
  type NoticeAudienceScope,
  type NoticeDraftInput,
} from "@/lib/ace-notice-api";
import { requestFailure } from "@/lib/request-error";
import { ApiError } from "@/lib/api-transport";
import { useAdminAccess } from "@/lib/use-admin-access";
import { hasPermission } from "@/lib/access";
import { NoticeAudiencePicker } from "./notice-audience-picker";

type FormState = {
  title: string;
  body: string;
  audience: NoticeAudience;
  audienceScope: NoticeAudienceScope;
  audienceTargetId: string | null;
  requiresAcknowledgement: boolean;
  expiresAtLocal: string;
};

type AudienceSelection = Pick<
  FormState,
  "audience" | "audienceScope" | "audienceTargetId"
>;

function audienceSelection(form: FormState): AudienceSelection {
  return {
    audience: form.audience,
    audienceScope: form.audienceScope,
    audienceTargetId: form.audienceTargetId,
  };
}

function audienceChanged(
  previous: AudienceSelection | null,
  current: AudienceSelection,
): boolean {
  return (
    previous !== null &&
    (previous.audience !== current.audience ||
      previous.audienceScope !== current.audienceScope ||
      previous.audienceTargetId !== current.audienceTargetId)
  );
}

const emptyForm: FormState = {
  title: "",
  body: "",
  audience: "STAFF",
  audienceScope: "SITE",
  audienceTargetId: null,
  requiresAcknowledgement: false,
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
  if ((form.audienceScope === "SITE") !== (form.audienceTargetId === null)) {
    throw new Error("Choose a target for this school audience.");
  }
  if (
    (form.audienceScope === "GROUP" || form.audienceScope === "CHILD") &&
    form.audience !== "PARENTS"
  ) {
    throw new Error("Group and child notices can only address guardians.");
  }
  const expiryDate = form.expiresAtLocal ? new Date(form.expiresAtLocal) : null;
  if (expiryDate && Number.isNaN(expiryDate.getTime())) {
    throw new Error("Enter a valid expiry date and time.");
  }
  const expiresAt = expiryDate?.toISOString() ?? null;
  if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) {
    throw new Error("Expiry must be in the future.");
  }
  return {
    title,
    body,
    audience: form.audience,
    audienceScope: form.audienceScope,
    audienceTargetId: form.audienceTargetId,
    requiresAcknowledgement: form.requiresAcknowledgement,
    expiresAt,
  };
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
  const [reviewedAudience, setReviewedAudience] =
    React.useState<AudienceSelection | null>(null);
  const [reviewedAudienceVersion, setReviewedAudienceVersion] = React.useState<
    string | null
  >(null);
  const [reconfirmationRequired, setReconfirmationRequired] =
    React.useState(false);
  const [reconfirmed, setReconfirmed] = React.useState(false);
  const [loading, setLoading] = React.useState(Boolean(draftId));
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(true);
  const [loadRevision, setLoadRevision] = React.useState(0);
  const [scheduledAt, setScheduledAt] = React.useState<string | null>(null);
  const [scheduledAtLocal, setScheduledAtLocal] = React.useState("");

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
          audienceScope: draft.audienceScope,
          audienceTargetId: draft.audienceTargetId,
          requiresAcknowledgement: draft.requiresAcknowledgement,
          expiresAtLocal: localDateTime(draft.expiresAt),
        });
        setRevision(draft.updatedAt);
        setScheduledAt(draft.scheduledAt);
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
    setReconfirmed(false);
    setSuccess(null);
  }

  function changeScope(scope: NoticeAudienceScope) {
    setForm((current) => ({
      ...current,
      audienceScope: scope,
      audienceTargetId: null,
      audience:
        scope === "GROUP" || scope === "CHILD" ? "PARENTS" : current.audience,
    }));
    setDirty(true);
    setPreview(null);
    setReconfirmed(false);
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

  async function act(action: "save" | "preview" | "publish" | "schedule") {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      if (action === "publish" || action === "schedule") {
        if (
          !id ||
          !preview ||
          dirty ||
          (reconfirmationRequired && !reconfirmed)
        )
          return;
        if (action === "schedule") {
          const date = new Date(scheduledAtLocal);
          if (
            !scheduledAtLocal ||
            Number.isNaN(date.getTime()) ||
            date <= new Date()
          ) {
            throw new Error("Choose a future date and time to publish.");
          }
          if (form.expiresAtLocal && date >= new Date(form.expiresAtLocal)) {
            throw new Error("Choose a time before the notice expires.");
          }
          await scheduleNotice(id, preview, date.toISOString());
        } else {
          await publishNotice(id, preview);
        }
        router.push(`/notices/${id}`);
        return;
      }
      const savedId = dirty || !id ? await save() : id;
      if (action === "save" && !dirty) setSuccess("Draft already saved.");
      if (action === "preview") {
        const result = await previewNoticeAudience(savedId);
        if (
          audienceChanged(reviewedAudience, audienceSelection(form)) ||
          (reviewedAudienceVersion !== null &&
            reviewedAudienceVersion !== result.audienceVersion)
        ) {
          setReconfirmationRequired(true);
        }
        setReviewedAudience(audienceSelection(form));
        setReviewedAudienceVersion(result.audienceVersion);
        setReconfirmed(false);
        setPreview(result);
        setSuccess(null);
      }
    } catch (cause) {
      setPreview(null);
      if (
        (action === "publish" || action === "schedule") &&
        cause instanceof ApiError &&
        cause.status === 409
      ) {
        setReconfirmationRequired(true);
        setReconfirmed(false);
      }
      setError(
        requestFailure(
          cause,
          action === "save"
            ? "Unable to save notice."
            : action === "preview"
              ? "Unable to review the audience."
              : action === "schedule"
                ? "Unable to schedule notice."
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
        ) : scheduledAt ? (
          <div className="space-y-3">
            <p className="text-sm text-text-primary">
              This notice is scheduled for{" "}
              {new Date(scheduledAt).toLocaleString()}. Cancel its schedule from
              the notice page before editing it.
            </p>
            <Button asChild variant="secondary">
              <Link href={`/notices/${id}`}>View scheduled notice</Link>
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
                disabled={pending}
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
                disabled={pending}
                maxLength={20_000}
                rows={10}
                value={form.body}
                onChange={(event) => change("body", event.target.value)}
              />
            </div>
            <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-shell/70 p-4 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={form.requiresAcknowledgement}
                disabled={pending}
                onChange={(event) =>
                  change("requiresAcknowledgement", event.target.checked)
                }
                className="mt-1 h-4 w-4 accent-accent-strong"
              />
              <span>
                <span className="block font-medium">
                  Request acknowledgement
                </span>
                <span className="mt-1 block text-text-muted">
                  Recipients can confirm they have read this notice. Their
                  response appears in the receipt totals.
                </span>
              </span>
            </label>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="notice-audience">Audience</Label>
                <Select
                  id="notice-audience"
                  value={form.audience}
                  disabled={pending}
                  onChange={(event) =>
                    change("audience", event.target.value as NoticeAudience)
                  }
                >
                  {form.audienceScope === "SITE" ||
                  form.audienceScope === "YEAR_BAND" ? (
                    <option value="PARENTS_AND_STAFF">Parents and staff</option>
                  ) : null}
                  <option value="PARENTS">Parents</option>
                  {form.audienceScope === "SITE" ||
                  form.audienceScope === "YEAR_BAND" ? (
                    <option value="STAFF">Staff</option>
                  ) : null}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notice-expiry">Expires (optional)</Label>
                <Input
                  id="notice-expiry"
                  type="datetime-local"
                  value={form.expiresAtLocal}
                  disabled={pending}
                  onChange={(event) =>
                    change("expiresAtLocal", event.target.value)
                  }
                />
              </div>
            </div>
            <NoticeAudiencePicker
              scope={form.audienceScope}
              targetId={form.audienceTargetId}
              pending={pending}
              onScopeChange={changeScope}
              onTargetChange={(targetId) =>
                change("audienceTargetId", targetId)
              }
            />
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
        <Card title="Ready to send">
          <p className="text-sm text-text-primary">
            {preview.recipientCount} eligible{" "}
            {preview.recipientCount === 1 ? "person" : "people"} for this reach.
            {preview.recipientCount > 0
              ? " Publication makes this notice available in their in-app inbox."
              : " No one can receive this notice yet. Check site memberships or guardian access before publishing."}
          </p>
          {form.requiresAcknowledgement ? (
            <p className="mt-2 text-sm text-text-muted">
              Recipients will be asked to acknowledge this notice after
              publication.
            </p>
          ) : null}
          {reconfirmationRequired ? (
            <label className="mt-4 flex items-start gap-3 rounded-xl border border-border-subtle bg-shell/70 p-4 text-sm text-text-primary">
              <input
                type="checkbox"
                checked={reconfirmed}
                onChange={(event) => setReconfirmed(event.target.checked)}
                className="mt-1 h-4 w-4 accent-accent-strong"
              />
              <span>
                I reviewed the current audience and recipient count again.
              </span>
            </label>
          ) : null}
          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={
                pending ||
                preview.recipientCount === 0 ||
                (reconfirmationRequired && !reconfirmed)
              }
              onClick={() => void act("publish")}
            >
              {pending ? "Working…" : "Publish now"}
            </Button>
          </div>
          <div className="mt-5 space-y-3 border-t border-border-subtle pt-5">
            <div className="space-y-1">
              <Label htmlFor="notice-scheduled-at">
                Or schedule publication
              </Label>
              <p className="text-sm text-text-muted">
                This notice will appear at or after the chosen time if the
                eligible audience is unchanged.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Input
                id="notice-scheduled-at"
                type="datetime-local"
                value={scheduledAtLocal}
                disabled={pending}
                onChange={(event) => setScheduledAtLocal(event.target.value)}
                className="max-w-xs"
              />
              <Button
                type="button"
                variant="secondary"
                disabled={
                  pending ||
                  preview.recipientCount === 0 ||
                  !scheduledAtLocal ||
                  (reconfirmationRequired && !reconfirmed)
                }
                onClick={() => void act("schedule")}
              >
                {pending ? "Working…" : "Schedule notice"}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </main>
  );
}
