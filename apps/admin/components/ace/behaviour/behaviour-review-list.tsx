"use client";

import React from "react";
import { Button } from "@pathway/ui";
import {
  AdminBehaviourApiError,
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
  onDenied: () => void;
  onRetry: () => void;
}) {
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const [extraItems, setExtraItems] = React.useState<
    AdminBehaviourReviewRequest[]
  >([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);

  React.useEffect(() => {
    setExtraItems([]);
    setNextCursor(reviews.kind === "ready" ? reviews.nextCursor : null);
    setMoreError(false);
  }, [reviews]);

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
