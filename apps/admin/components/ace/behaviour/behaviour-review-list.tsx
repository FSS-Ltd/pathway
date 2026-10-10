"use client";

import React from "react";
import { Button } from "@pathway/ui";
import {
  AdminBehaviourApiError,
  type AdminBehaviourEntry,
  type AdminBehaviourReviewRequest,
  type AdminBehaviourReviewResponse,
} from "@/lib/api-client";
import { formatSiteDateTime } from "./behaviour-time";

export type ReviewView =
  | { kind: "idle" | "loading" | "denied" | "error" }
  | {
      kind: "ready";
      items: AdminBehaviourReviewRequest[];
      nextCursor: string | null;
    };

export function BehaviourReviewList({
  childId,
  siteTimeZone,
  reviews,
  loadRequests,
  loadFact,
  onDenied,
  onRetry,
}: {
  childId: string;
  siteTimeZone: string;
  reviews: ReviewView;
  loadRequests: (
    childId: string,
    cursor?: string,
  ) => Promise<AdminBehaviourReviewResponse>;
  loadFact: (requestId: string) => Promise<{ entry: AdminBehaviourEntry }>;
  onDenied: () => void;
  onRetry: () => void;
}) {
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const [extraItems, setExtraItems] = React.useState<
    AdminBehaviourReviewRequest[]
  >([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [fact, setFact] = React.useState<
    | { kind: "idle" | "loading" | "error"; requestId: string | null }
    | { kind: "ready"; requestId: string; entry: AdminBehaviourEntry }
  >({ kind: "idle", requestId: null });
  const factRequest = React.useRef(0);

  React.useEffect(() => {
    setExtraItems([]);
    setNextCursor(reviews.kind === "ready" ? reviews.nextCursor : null);
    setMoreError(false);
    factRequest.current += 1;
    setFact({ kind: "idle", requestId: null });
  }, [reviews]);

  const openFact = async (requestId: string) => {
    const requestNumber = ++factRequest.current;
    setFact({ kind: "loading", requestId });
    try {
      const response = await loadFact(requestId);
      if (requestNumber === factRequest.current)
        setFact({ kind: "ready", requestId, entry: response.entry });
    } catch (cause) {
      if (requestNumber !== factRequest.current) return;
      if (
        cause instanceof AdminBehaviourApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        onDenied();
      else setFact({ kind: "error", requestId });
    }
  };

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await loadRequests(childId, nextCursor);
      setExtraItems((current) => [...current, ...page.items]);
      setNextCursor(page.nextCursor);
    } catch (cause) {
      if (
        cause instanceof AdminBehaviourApiError &&
        (cause.status === 401 || cause.status === 403)
      )
        onDenied();
      else setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  };

  if (reviews.kind === "loading")
    return (
      <p className="mt-5 text-sm text-text-muted" role="status">
        Checking reviewer access…
      </p>
    );
  if (reviews.kind === "denied")
    return (
      <p className="mt-5 text-sm text-text-muted" role="status">
        A current Head or Lead role is required to escalate a stage.
      </p>
    );
  if (reviews.kind === "error")
    return (
      <div className="mt-5" role="alert">
        <p className="text-sm text-red-700">
          Unable to verify your reviewer role.
        </p>
        <button
          type="button"
          className="mt-2 text-sm font-medium text-primary underline"
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    );
  if (reviews.kind !== "ready") return null;

  const items = [...reviews.items, ...extraItems];
  return (
    <div className="mt-6 border-t border-border pt-5">
      <h3 className="font-medium text-text-primary">
        Review requests for this learner
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-muted">No review requests yet.</p>
      ) : (
        <ol className="mt-3 space-y-2">
          {items.map((request) => (
            <li
              key={request.id}
              className="rounded-md border border-border p-3 text-sm text-text-primary"
            >
              <span className="font-medium">
                {request.kind === "HEAD" ? "Head" : "Site"} review · Stage{" "}
                {request.stage}
              </span>
              <span className="block text-text-muted">
                <time dateTime={request.requestedAt}>
                  {formatSiteDateTime(request.requestedAt, siteTimeZone)}
                </time>
              </span>
              {request.behaviourEntryId ? (
                <>
                  <Button
                    className="mt-2"
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={
                      fact.kind === "loading" && fact.requestId === request.id
                    }
                    aria-expanded={
                      fact.kind === "ready" && fact.requestId === request.id
                    }
                    aria-controls={
                      fact.kind === "ready" && fact.requestId === request.id
                        ? `behaviour-review-fact-${request.id}`
                        : undefined
                    }
                    onClick={() => {
                      if (
                        fact.kind === "ready" &&
                        fact.requestId === request.id
                      ) {
                        factRequest.current += 1;
                        setFact({ kind: "idle", requestId: null });
                      } else {
                        void openFact(request.id);
                      }
                    }}
                  >
                    {fact.kind === "loading" && fact.requestId === request.id
                      ? "Loading fact…"
                      : fact.kind === "ready" && fact.requestId === request.id
                        ? "Hide current fact"
                        : "View current fact"}
                  </Button>
                  {fact.requestId === request.id && fact.kind === "error" ? (
                    <p className="mt-2 text-sm text-red-700" role="alert">
                      Unable to open this fact. Try again.
                    </p>
                  ) : null}
                  {fact.requestId === request.id && fact.kind === "ready" ? (
                    <ReviewFact
                      id={`behaviour-review-fact-${request.id}`}
                      entry={fact.entry}
                      originalEntryId={request.behaviourEntryId}
                      siteTimeZone={siteTimeZone}
                    />
                  ) : null}
                </>
              ) : (
                <span className="mt-2 block text-text-muted">
                  Manual stage escalation
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
      {moreError ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Unable to load more requests. Try again.
        </p>
      ) : null}
      {nextCursor ? (
        <Button
          className="mt-3"
          type="button"
          variant="secondary"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? "Loading…" : "Load more requests"}
        </Button>
      ) : null}
    </div>
  );
}

function ReviewFact({
  id,
  entry,
  originalEntryId,
  siteTimeZone,
}: {
  id: string;
  entry: AdminBehaviourEntry;
  originalEntryId: string;
  siteTimeZone: string;
}) {
  return (
    <div id={id} className="mt-3 border-t border-border pt-3 text-sm">
      <p className="font-medium text-text-primary">
        {entry.id === originalEntryId
          ? "Current behaviour fact"
          : "Current corrected fact"}
      </p>
      <p className="mt-1 text-text-muted">
        {entry.visibility === "SENSITIVE" ? "Sensitive" : "General"} ·{" "}
        <span className="capitalize">
          {entry.category.replaceAll("-", " ")}
        </span>{" "}
        · {entry.pointsDelta} points ·{" "}
        <time dateTime={entry.occurredAt}>
          {formatSiteDateTime(entry.occurredAt, siteTimeZone)}
        </time>
      </p>
      <p className="mt-2 whitespace-pre-wrap break-words text-text-primary">
        {entry.reason}
      </p>
      {entry.note ? (
        <p className="mt-2 whitespace-pre-wrap break-words text-text-muted">
          {entry.note}
        </p>
      ) : null}
    </div>
  );
}
