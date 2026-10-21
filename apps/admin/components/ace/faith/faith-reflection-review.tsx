"use client";

import React from "react";
import { Badge, Button } from "@pathway/ui";
import {
  fetchFaithReflections,
  moderateFaithReflection,
  releaseFaithReflection,
  type FaithReflection,
} from "@/lib/ace-faith-api";
import { requestFailure } from "@/lib/request-error";

type Decision = "APPROVED" | "REJECTED" | "RELEASE";

function decisionLabel(decision: Decision): string {
  if (decision === "APPROVED") return "Approve";
  if (decision === "REJECTED") return "Reject";
  return "Release to guardians";
}

export function FaithReflectionReview({ contentId }: { contentId: string }) {
  const [items, setItems] = React.useState<FaithReflection[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<{
    id: string;
    decision: Decision;
  } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const focusAfterLoad = React.useRef<string | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchFaithReflections(contentId, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        setItems(page.items);
        setNextCursor(page.nextCursor);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(
            requestFailure(cause, "Unable to load reflections.").message,
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [contentId]);

  React.useEffect(() => {
    const id = focusAfterLoad.current;
    if (id && !loading) {
      document.getElementById(`faith-reflection-${id}`)?.focus();
      focusAfterLoad.current = null;
    }
  }, [items, loading]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore || pendingId) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchFaithReflections(
        contentId,
        undefined,
        nextCursor,
      );
      setItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      setError(
        requestFailure(cause, "Unable to load more reflections.").message,
      );
    } finally {
      setLoadingMore(false);
    }
  };

  const applyDecision = async () => {
    if (!confirm || pendingId) return;
    const { id, decision } = confirm;
    setPendingId(id);
    setError(null);
    setSuccess(null);
    try {
      if (decision === "RELEASE") await releaseFaithReflection(contentId, id);
      else await moderateFaithReflection(contentId, id, decision);
      const page = await fetchFaithReflections(contentId);
      setItems(page.items);
      setNextCursor(page.nextCursor);
      setSuccess(`${decisionLabel(decision)} completed.`);
      focusAfterLoad.current = id;
      setConfirm(null);
    } catch (cause) {
      setError(requestFailure(cause, "Unable to update reflection.").message);
    } finally {
      setPendingId(null);
    }
  };

  return (
    <section
      id={`faith-review-${contentId}`}
      aria-label="Student reflections"
      className="mt-4 space-y-3 border-t border-border pt-4"
    >
      <div>
        <h3 className="font-heading text-base font-semibold text-text-primary">
          Student reflections
        </h3>
        <p className="text-sm text-text-muted">
          Pending reflections stay private to the student and staff. Release
          approved text only when it is suitable for linked guardians.
        </p>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {loading ? <p role="status">Loading reflections…</p> : null}
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
      {!loading && items.length === 0 && !error ? (
        <p className="text-sm text-text-muted">No reflections submitted yet.</p>
      ) : null}
      <ul className="space-y-3">
        {items.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-border bg-background p-3"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h4
                  id={`faith-reflection-${item.id}`}
                  tabIndex={-1}
                  className="font-medium text-text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-status-info"
                >
                  {item.studentName ?? "Student reflection"}
                </h4>
                <p className="text-xs text-text-muted">
                  Submitted {new Date(item.submittedAt).toLocaleString()}
                </p>
              </div>
              <Badge>
                {item.visibility === "RELEASED_GUARDIANS"
                  ? "Released to guardians"
                  : item.moderationStatus === "PENDING"
                    ? "Pending review"
                    : item.moderationStatus === "APPROVED"
                      ? "Approved · staff only"
                      : "Rejected · staff only"}
              </Badge>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm text-text-secondary">
              {item.text}
            </p>
            {confirm?.id === item.id ? (
              <div className="mt-3 space-y-2 rounded-lg border border-border bg-surface p-3">
                <p className="text-sm text-text-primary">
                  {confirm.decision === "RELEASE"
                    ? "Release this text to guardians with current full access?"
                    : `${decisionLabel(confirm.decision)} this reflection? This decision cannot be changed.`}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={pendingId !== null}
                    onClick={() => void applyDecision()}
                  >
                    {pendingId
                      ? "Saving…"
                      : `Confirm ${decisionLabel(confirm.decision).toLowerCase()}`}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pendingId !== null}
                    onClick={() => setConfirm(null)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap gap-2">
                {item.moderationStatus === "PENDING" ? (
                  <>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pendingId !== null}
                      onClick={() =>
                        setConfirm({ id: item.id, decision: "APPROVED" })
                      }
                    >
                      Approve
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pendingId !== null}
                      onClick={() =>
                        setConfirm({ id: item.id, decision: "REJECTED" })
                      }
                    >
                      Reject
                    </Button>
                  </>
                ) : item.moderationStatus === "APPROVED" &&
                  item.visibility === "AUTHOR_AND_STAFF" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pendingId !== null}
                    onClick={() =>
                      setConfirm({ id: item.id, decision: "RELEASE" })
                    }
                  >
                    Release to guardians
                  </Button>
                ) : null}
              </div>
            )}
          </li>
        ))}
      </ul>
      {nextCursor ? (
        <Button
          type="button"
          variant="secondary"
          disabled={loadingMore || pendingId !== null}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading more…" : "Load more reflections"}
        </Button>
      ) : null}
    </section>
  );
}
