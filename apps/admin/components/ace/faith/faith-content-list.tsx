"use client";

import React from "react";
import { Badge, Button, Input, Label } from "@pathway/ui";
import type { FaithContent, FaithDraft } from "@/lib/ace-faith-api";

type Action = "publish" | "schedule" | "cancel-schedule" | "withdraw";

function scheduleReviewGuidance(reason: string): string {
  switch (reason) {
    case "PUBLISHER_ACCESS_CHANGED":
      return "The person who scheduled this no longer has publication access. Ask a site lead to review it.";
    case "PUBLICATION_INPUT_CHANGED":
      return "The draft, audience or current publication changed. Review it before publishing or scheduling again.";
    case "CONTENT_WITHDRAWN":
      return "This content was withdrawn. Review it before publishing again.";
    default:
      return "The scheduled publication could not be completed. Review this draft before trying again.";
  }
}

function FaithContentCard({
  item,
  authoringEnabled,
  publicationEnabled,
  canCancelSchedule,
  pending,
  onRevision,
  onEditDraft,
  onAction,
}: {
  item: FaithContent;
  authoringEnabled: boolean;
  publicationEnabled: boolean;
  canCancelSchedule: boolean;
  pending: boolean;
  onRevision: (item: FaithContent, replacement?: boolean) => void;
  onEditDraft: (item: FaithContent, draft: FaithDraft) => void;
  onAction: (
    item: FaithContent,
    action: Action,
    draft?: FaithDraft,
    scheduledAt?: string,
  ) => void;
}) {
  const [confirm, setConfirm] = React.useState<{
    action: Action;
    draft?: FaithDraft;
  } | null>(null);
  const [scheduleAt, setScheduleAt] = React.useState("");
  const [validation, setValidation] = React.useState<string | null>(null);
  const isPublished = Boolean(item.latestVersionId) && !item.withdrawnAt;

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirm || pending) return;
    let scheduledAt: string | undefined;
    if (confirm.action === "schedule") {
      const value = new Date(scheduleAt);
      if (Number.isNaN(value.getTime()) || value.getTime() <= Date.now()) {
        setValidation("Choose a future publication date and time.");
        return;
      }
      scheduledAt = value.toISOString();
    }
    setValidation(null);
    onAction(item, confirm.action, confirm.draft, scheduledAt);
    setConfirm(null);
  };

  return (
    <li className="min-w-0 rounded-xl border border-border bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2
            id={`faith-content-${item.id}`}
            tabIndex={-1}
            className="break-words font-heading text-lg font-semibold text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-info"
          >
            {item.title}
          </h2>
          <p className="text-sm text-text-muted">
            {item.latestVersionNumber > 0
              ? `Version ${item.latestVersionNumber}`
              : "Not yet published"}
          </p>
        </div>
        <Badge>
          {item.withdrawnAt ? "Withdrawn" : isPublished ? "Published" : "Draft"}
        </Badge>
      </div>
      {item.publishedNeedsReview ? (
        <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
          <p role="status" className="text-sm text-status-warning">
            The latest published version needs review. Its stored content or
            audience cannot be displayed here.
          </p>
          <div className="flex flex-wrap gap-2">
            {isPublished && publicationEnabled ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => setConfirm({ action: "withdraw" })}
              >
                Withdraw publication
              </Button>
            ) : null}
            {authoringEnabled ? (
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => onRevision(item, true)}
              >
                Create replacement draft
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      {item.publishedVersion ? (
        <div className="mt-3 space-y-2">
          <p className="line-clamp-3 whitespace-pre-wrap break-words text-sm text-text-secondary">
            {item.publishedVersion.contentPayload.body}
          </p>
          <p className="text-xs text-text-muted">
            {item.publishedVersion.audience.type === "AGE_BAND"
              ? "Selected age bands"
              : "All active students"}
          </p>
          {isPublished && publicationEnabled ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => setConfirm({ action: "withdraw" })}
            >
              Withdraw publication
            </Button>
          ) : null}
          {authoringEnabled ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => onRevision(item)}
            >
              New revision
            </Button>
          ) : null}
        </div>
      ) : null}
      {item.drafts.length > 0 ? (
        <div className="mt-4 space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold text-text-primary">Drafts</h3>
          {item.drafts.map((draft) => (
            <div key={draft.id} className="rounded-lg border border-border p-3">
              <p className="break-words text-sm font-medium text-text-primary">
                {draft.title}
              </p>
              {draft.needsReview || !draft.contentPayload || !draft.audience ? (
                <p role="status" className="mt-2 text-sm text-status-warning">
                  This draft needs review. Its stored content or audience cannot
                  be read, so it cannot be edited or published.
                </p>
              ) : (
                <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm text-text-secondary">
                  {draft.contentPayload.body}
                </p>
              )}
              {draft.scheduledAt ? (
                <p className="mt-2 text-sm text-text-muted">
                  Scheduled for {new Date(draft.scheduledAt).toLocaleString()}
                </p>
              ) : null}
              {draft.scheduleFailureReason ? (
                <p className="mt-2 text-sm text-status-danger" role="status">
                  Schedule needs review:{" "}
                  {scheduleReviewGuidance(draft.scheduleFailureReason)}
                </p>
              ) : null}
              {draft.status === "DRAFT" &&
              (publicationEnabled ||
                (canCancelSchedule && Boolean(draft.scheduledAt))) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {draft.scheduledAt ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={() =>
                        setConfirm({ action: "cancel-schedule", draft })
                      }
                    >
                      Cancel schedule
                    </Button>
                  ) : !draft.needsReview &&
                    draft.contentPayload &&
                    draft.audience ? (
                    <>
                      <Button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirm({ action: "publish", draft })}
                      >
                        Publish now
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={pending}
                        onClick={() =>
                          setConfirm({ action: "schedule", draft })
                        }
                      >
                        Schedule
                      </Button>
                    </>
                  ) : null}
                </div>
              ) : null}
              {draft.status === "DRAFT" &&
              !draft.scheduledAt &&
              !draft.needsReview &&
              draft.contentPayload &&
              draft.audience &&
              authoringEnabled ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onEditDraft(item, draft)}
                >
                  Edit draft
                </Button>
              ) : null}
              {draft.status === "DRAFT" &&
              draft.needsReview &&
              !draft.scheduledAt &&
              authoringEnabled &&
              !item.publishedNeedsReview ? (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => onRevision(item, true)}
                >
                  Create replacement draft
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {confirm ? (
        <form
          onSubmit={submit}
          className="mt-4 space-y-3 rounded-lg border border-border bg-background p-3"
        >
          <p className="text-sm font-medium text-text-primary">
            {confirm.action === "publish"
              ? `Publish “${confirm.draft?.title}” to its selected student audience?`
              : confirm.action === "withdraw"
                ? `Withdraw “${item.title}” from student and family view? Its history will remain.`
                : confirm.action === "cancel-schedule"
                  ? `Cancel the schedule for “${confirm.draft?.title}”? The draft will remain private.`
                  : `Choose when to publish “${confirm.draft?.title}”.`}
          </p>
          {confirm.action === "schedule" ? (
            <div className="space-y-1">
              <Label htmlFor={`faith-schedule-${item.id}`}>
                Publication date and time
              </Label>
              <Input
                id={`faith-schedule-${item.id}`}
                type="datetime-local"
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
                required
                disabled={pending}
              />
            </div>
          ) : null}
          {validation ? (
            <p role="alert" className="text-sm text-status-danger">
              {validation}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending
                ? "Working…"
                : confirm.action === "publish"
                  ? "Confirm publication"
                  : confirm.action === "withdraw"
                    ? "Confirm withdrawal"
                    : confirm.action === "schedule"
                      ? "Confirm schedule"
                      : "Confirm cancellation"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setConfirm(null);
                setValidation(null);
              }}
            >
              Keep as is
            </Button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

export function FaithContentList({
  items,
  authoringEnabled,
  publicationEnabled,
  canCancelSchedule = false,
  pendingId,
  onRevision,
  onEditDraft,
  onAction,
}: {
  items: FaithContent[];
  authoringEnabled: boolean;
  publicationEnabled: boolean;
  canCancelSchedule?: boolean;
  pendingId: string | null;
  onRevision: (item: FaithContent, replacement?: boolean) => void;
  onEditDraft: (item: FaithContent, draft: FaithDraft) => void;
  onAction: (
    item: FaithContent,
    action: Action,
    draft?: FaithDraft,
    scheduledAt?: string,
  ) => void;
}) {
  if (items.length === 0)
    return (
      <p
        id="faith-content-list"
        className="rounded-xl border border-border bg-surface p-5 text-sm text-text-muted"
      >
        No faith content has been drafted for this site yet.
      </p>
    );
  return (
    <ul
      id="faith-content-list"
      className="space-y-4"
      aria-label="Faith content"
    >
      {items.map((item) => (
        <FaithContentCard
          key={item.id}
          item={item}
          authoringEnabled={authoringEnabled}
          publicationEnabled={publicationEnabled}
          canCancelSchedule={canCancelSchedule}
          pending={pendingId !== null}
          onRevision={onRevision}
          onEditDraft={onEditDraft}
          onAction={onAction}
        />
      ))}
    </ul>
  );
}
