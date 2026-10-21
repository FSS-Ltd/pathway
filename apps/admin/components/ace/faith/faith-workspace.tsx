"use client";

import React from "react";
import { Button } from "@pathway/ui";
import { NoAccessCard } from "@/components/no-access-card";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  cancelFaithSchedule,
  createFaithDraft,
  FaithRequestError,
  fetchFaithContent,
  fetchFaithOptions,
  fetchFaithSettings,
  publishFaithDraft,
  scheduleFaithDraft,
  updateFaithSettings,
  updateFaithDraft,
  withdrawFaithContent,
  type FaithContent,
  type FaithDraft,
  type FaithDraftInput,
  type FaithList,
  type FaithOptions,
} from "@/lib/ace-faith-api";
import { requestFailure } from "@/lib/request-error";
import { useAdminAccess } from "@/lib/use-admin-access";
import { FaithContentList } from "./faith-content-list";
import { FaithDraftForm } from "./faith-draft-form";
import { FaithSettingsForm } from "./faith-settings-form";

function faithError(cause: unknown): string {
  if (cause instanceof FaithRequestError) {
    if (cause.status === 400)
      return "Check the content, audience and date, then try again.";
    if (cause.status === 403)
      return "Your access changed. Reload the page before trying again.";
    if (cause.status === 409)
      return "This content changed. Reload it before trying again.";
    if (cause.status === 503) return "Faith publication is not available yet.";
  }
  return requestFailure(
    cause,
    "Unable to save faith content. Reload and try again.",
  ).message;
}

export function FaithWorkspace() {
  const { permissions, isLoading: accessLoading } = useAdminAccess();
  const canManage = permissions?.includes("ace.faith.manage") === true;
  const [list, setList] = React.useState<FaithList | null>(null);
  const canPublish =
    permissions?.includes("ace.faith.publish") === true &&
    list?.siteLead === true;
  const [options, setOptions] = React.useState<FaithOptions | null>(null);
  const [displayLabel, setDisplayLabel] = React.useState("Faith Corner");
  const [editing, setEditing] = React.useState<{
    content: FaithContent | null;
    draft: FaithDraft | null;
    replacement?: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  const siteGeneration = React.useRef(0);
  const focusAfterLoad = React.useRef<string | null>(null);
  const loadMoreController = React.useRef<AbortController | null>(null);

  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        siteGeneration.current += 1;
        loadMoreController.current?.abort();
        setList(null);
        setOptions(null);
        setDisplayLabel("Faith Corner");
        setEditing(null);
        setPendingId(null);
        setError(null);
        setLoadMoreError(null);
        setIsLoadingMore(false);
        setSuccess(null);
        focusAfterLoad.current = null;
        setRevision((value) => value + 1);
      }),
    [],
  );

  React.useEffect(() => {
    if (accessLoading || !canManage) return;
    const controller = new AbortController();
    const generation = siteGeneration.current;
    loadMoreController.current?.abort();
    setIsLoadingMore(false);
    setLoadMoreError(null);
    setIsLoading(true);
    setError(null);
    void Promise.all([
      fetchFaithContent(controller.signal),
      fetchFaithOptions(controller.signal),
      fetchFaithSettings(controller.signal),
    ])
      .then(([content, choices, settings]) => {
        if (controller.signal.aborted || generation !== siteGeneration.current)
          return;
        setList(content);
        setOptions(choices);
        setDisplayLabel(settings.displayLabel);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted || generation !== siteGeneration.current)
          return;
        setError(
          requestFailure(cause, "Unable to load faith content.").message,
        );
      })
      .finally(() => {
        if (!controller.signal.aborted && generation === siteGeneration.current)
          setIsLoading(false);
      });
    return () => {
      controller.abort();
      loadMoreController.current?.abort();
    };
  }, [accessLoading, canManage, revision]);

  React.useEffect(() => {
    const id = focusAfterLoad.current;
    if (!isLoading && id) {
      const heading = document.getElementById(`faith-content-${id}`);
      if (heading) {
        heading.focus();
        focusAfterLoad.current = null;
      }
    }
  }, [isLoading, list]);

  const perform = async (
    key: string,
    operation: () => Promise<unknown>,
    message: string,
    focusId?: string,
  ) => {
    if (pendingId) return;
    const generation = siteGeneration.current;
    setPendingId(key);
    setError(null);
    setSuccess(null);
    try {
      await operation();
      if (generation !== siteGeneration.current) return;
      setEditing(null);
      focusAfterLoad.current = focusId ?? null;
      setSuccess(message);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (generation === siteGeneration.current) setError(faithError(cause));
    } finally {
      if (generation === siteGeneration.current) setPendingId(null);
    }
  };

  const loadMore = async () => {
    const cursor = list?.nextCursor;
    if (!cursor || isLoading || isLoadingMore || pendingId) return;
    const generation = siteGeneration.current;
    const controller = new AbortController();
    loadMoreController.current = controller;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await fetchFaithContent(controller.signal, cursor);
      if (controller.signal.aborted || generation !== siteGeneration.current)
        return;
      focusAfterLoad.current = page.items[0]?.id ?? null;
      setList((current) => {
        if (!current || current.nextCursor !== cursor) return current;
        const seen = new Set(current.items.map((item) => item.id));
        return {
          ...page,
          items: [
            ...current.items,
            ...page.items.filter((item) => !seen.has(item.id)),
          ],
        };
      });
    } catch (cause) {
      if (controller.signal.aborted || generation !== siteGeneration.current)
        return;
      setLoadMoreError(
        requestFailure(cause, "Unable to load more faith content.").message,
      );
    } finally {
      if (generation === siteGeneration.current) setIsLoadingMore(false);
      if (loadMoreController.current === controller)
        loadMoreController.current = null;
    }
  };

  const save = (
    input: FaithDraftInput & { draftId?: string; expectedUpdatedAt?: string },
  ) =>
    perform(
      "draft",
      () => {
        if (!input.draftId) return createFaithDraft(input);
        if (!input.faithContentId || !input.expectedUpdatedAt)
          throw new Error("Reload the draft before editing it.");
        return updateFaithDraft(
          input.faithContentId,
          input.draftId,
          input,
          input.expectedUpdatedAt,
        );
      },
      input.draftId ? "Private draft updated." : "Private draft saved.",
      input.faithContentId,
    );

  const action = (
    item: FaithContent,
    type: "publish" | "schedule" | "cancel-schedule" | "withdraw",
    draft?: FaithDraft,
    scheduledAt?: string,
  ) => {
    void perform(
      item.id,
      () => {
        if (type === "publish" && draft)
          return publishFaithDraft(item.id, draft.id, item.latestVersionId);
        if (type === "schedule" && draft && scheduledAt)
          return scheduleFaithDraft(
            item.id,
            draft.id,
            item.latestVersionId,
            scheduledAt,
          );
        if (type === "cancel-schedule" && draft)
          return cancelFaithSchedule(item.id, draft.id);
        if (type === "withdraw" && item.latestVersionId)
          return withdrawFaithContent(item.id, item.latestVersionId);
        throw new Error("Choose a draft and complete the confirmation.");
      },
      type === "publish"
        ? "Content published."
        : type === "schedule"
          ? "Publication scheduled."
          : type === "cancel-schedule"
            ? "Schedule cancelled."
            : "Publication withdrawn.",
      item.id,
    );
  };

  if (accessLoading)
    return (
      <p role="status" className="text-sm text-text-muted">
        Checking faith content access…
      </p>
    );
  if (!canManage)
    return (
      <NoAccessCard
        title="Faith Corner"
        message="You do not have permission to manage faith content."
      />
    );

  return (
    <div className="min-w-0 space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-semibold text-text-primary">
            {displayLabel}
          </h1>
          <p className="text-sm text-text-muted">
            Prepare age-aware content for the active ACE site.
          </p>
        </div>
        {!editing && list?.authoringEnabled ? (
          <Button
            type="button"
            onClick={() => setEditing({ content: null, draft: null })}
          >
            New content
          </Button>
        ) : null}
      </header>
      {list && !list.authoringEnabled ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-3 text-sm text-text-muted"
        >
          Faith content authoring is not enabled for this site yet.
        </p>
      ) : null}
      {list && !list.publicationEnabled ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-3 text-sm text-text-muted"
        >
          Drafts are private. Publication will open after the school security
          review.
        </p>
      ) : null}
      <div aria-live="polite" aria-atomic="true">
        {isLoading ? (
          <p role="status" className="text-sm text-text-muted">
            Loading faith content…
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
        ) : null}
        {success ? (
          <p role="status" className="text-sm text-status-success">
            {success}
          </p>
        ) : null}
      </div>
      {error && !isLoading ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Reload content
        </Button>
      ) : null}
      {editing && options && list?.authoringEnabled ? (
        <FaithDraftForm
          key={
            editing.replacement
              ? `replacement-${editing.content?.id}`
              : (editing.draft?.id ?? editing.content?.id ?? "new")
          }
          initial={
            !editing.replacement &&
            editing.draft &&
            editing.content &&
            !editing.draft.needsReview &&
            editing.draft.contentPayload &&
            editing.draft.audience
              ? {
                  faithContentId: editing.content.id,
                  draftId: editing.draft.id,
                  expectedUpdatedAt: editing.draft.updatedAt,
                  title: editing.draft.title,
                  contentPayload: editing.draft.contentPayload,
                  audience: editing.draft.audience,
                }
              : !editing.replacement && editing.content?.publishedVersion
                ? {
                    faithContentId: editing.content.id,
                    title: editing.content.publishedVersion.title,
                    contentPayload:
                      editing.content.publishedVersion.contentPayload,
                    audience: editing.content.publishedVersion.audience,
                  }
                : editing.content
                  ? {
                      faithContentId: editing.content.id,
                      replacement: editing.replacement ?? true,
                    }
                  : undefined
          }
          options={options}
          pending={pendingId !== null}
          onSave={save}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {list && !isLoading ? (
        <FaithContentList
          items={list.items}
          authoringEnabled={list.authoringEnabled}
          publicationEnabled={list.publicationEnabled && canPublish}
          canCancelSchedule={canPublish}
          pendingId={pendingId}
          onRevision={(content, replacement) =>
            setEditing({ content, draft: null, replacement })
          }
          onEditDraft={(content, draft) => setEditing({ content, draft })}
          onAction={action}
        />
      ) : null}
      {list?.nextCursor && !isLoading ? (
        <div className="space-y-2">
          {loadMoreError ? (
            <p role="alert" className="text-sm text-status-danger">
              {loadMoreError}
            </p>
          ) : null}
          <Button
            type="button"
            variant="secondary"
            aria-controls="faith-content-list"
            disabled={isLoadingMore || pendingId !== null}
            onClick={() => void loadMore()}
          >
            {isLoadingMore ? "Loading more…" : "Load more"}
          </Button>
          {isLoadingMore ? (
            <p role="status" className="text-sm text-text-muted">
              Loading more faith content…
            </p>
          ) : null}
        </div>
      ) : null}
      {canPublish && list?.authoringEnabled && !isLoading ? (
        <FaithSettingsForm
          displayLabel={displayLabel}
          pending={pendingId !== null}
          onSave={(label) =>
            perform(
              "settings",
              async () => {
                const updated = await updateFaithSettings(label);
                setDisplayLabel(updated.displayLabel);
              },
              "Site display name saved.",
            )
          }
        />
      ) : null}
    </div>
  );
}
