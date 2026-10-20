"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import { NoAccessCard } from "@/components/no-access-card";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  fetchHomeworkReviewQueue,
  type HomeworkReviewQueueItem,
} from "@/lib/ace-homework-review-api";
import { ReviewCard } from "./homework-review-card";
import { useAdminAccess } from "@/lib/use-admin-access";

export function HomeworkReviewWorkspace() {
  const { permissions, isLoading: accessLoading } = useAdminAccess();
  const canReview =
    permissions?.includes("ace.homework.reviews.manage") === true;
  const [items, setItems] = React.useState<HomeworkReviewQueueItem[]>([]);
  const [reviewsEnabled, setReviewsEnabled] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  React.useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        setItems([]);
        setReviewsEnabled(false);
        setSuccess(null);
        setRevision((value) => value + 1);
      }),
    [],
  );
  React.useEffect(() => {
    if (accessLoading || !canReview) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchHomeworkReviewQueue(controller.signal)
      .then((queue) => {
        if (!controller.signal.aborted) {
          setItems(queue.items);
          setReviewsEnabled(queue.reviewsEnabled);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError("Unable to load homework reviews.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [accessLoading, canReview, revision]);

  if (accessLoading)
    return (
      <p role="status" className="text-sm text-text-muted">
        Checking review access…
      </p>
    );
  if (!canReview)
    return (
      <NoAccessCard
        title="Homework reviews"
        message="You do not have permission to review homework."
      />
    );
  return (
    <main className="min-w-0 space-y-5">
      <header className="space-y-1">
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          Review homework
        </h1>
        <p className="text-sm text-text-muted">
          Review submitted work for your current classes. Completed feedback
          stays private until you release it.
        </p>
      </header>
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading reviews…
        </p>
      ) : null}
      {!loading && !error && !reviewsEnabled ? (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface p-3 text-sm text-text-muted"
        >
          Reviews will open after the school security check.
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
      {error && !loading ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRevision((value) => value + 1)}
        >
          Retry
        </Button>
      ) : null}
      {!loading && !error && reviewsEnabled && items.length === 0 ? (
        <Card className="p-5">
          <p className="text-sm text-text-muted">
            No work is waiting for review or release.
          </p>
        </Card>
      ) : null}
      {!loading && !error && reviewsEnabled ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {items.map((item) => (
            <ReviewCard
              key={item.versionId}
              item={item}
              onDone={(result) => {
                setSuccess(
                  result === "RETURNED"
                    ? "Work returned for changes."
                    : result === "COMPLETED"
                      ? "Review completed. Feedback is private until release."
                      : "Feedback released to the family.",
                );
                setRevision((value) => value + 1);
              }}
            />
          ))}
        </div>
      ) : null}
    </main>
  );
}
