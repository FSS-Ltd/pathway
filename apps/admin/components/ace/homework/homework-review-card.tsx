"use client";

import React from "react";
import { Button, Card, Label } from "@pathway/ui";
import {
  releaseHomeworkReview,
  submitHomeworkReview,
  type HomeworkReviewQueueItem,
} from "@/lib/ace-homework-review-api";

export function ReviewCard({
  item,
  onDone,
}: {
  item: HomeworkReviewQueueItem;
  onDone: (result: "RETURNED" | "COMPLETED" | "RELEASED") => void;
}) {
  const [feedback, setFeedback] = React.useState("");
  const [staffNote, setStaffNote] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [confirmRelease, setConfirmRelease] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const submit = async (decision: "RETURNED" | "COMPLETED") => {
    if (pending || (decision === "RETURNED" && !feedback.trim())) return;
    setPending(true);
    setError(null);
    try {
      await submitHomeworkReview({
        versionId: item.versionId,
        decision,
        feedback: feedback.trim(),
        staffNote: staffNote.trim(),
        idempotencyKey: crypto.randomUUID(),
      });
      onDone(decision);
    } catch {
      setError("Review could not be saved. Reload the queue and try again.");
    } finally {
      setPending(false);
    }
  };
  const release = async () => {
    if (!item.review || pending) return;
    setPending(true);
    setError(null);
    try {
      await releaseHomeworkReview(item.review.id);
      onDone("RELEASED");
    } catch {
      setError(
        "Feedback could not be released. Reload the queue and try again.",
      );
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="min-w-0 space-y-4 p-4 sm:p-5">
      <header>
        <h3 className="break-words font-heading text-lg font-semibold text-text-primary">
          {item.studentName} · {item.assignmentTitle}
        </h3>
        <p className="text-sm text-text-muted">
          Version {item.version} · Submitted{" "}
          {new Date(item.submittedAt).toLocaleString()}
          {item.late ? " · Late" : ""}
        </p>
      </header>
      <p className="whitespace-pre-wrap break-words text-sm text-text-secondary">
        {item.text}
      </p>
      {item.evidence ? (
        <p className="text-sm text-text-muted">
          Clean evidence attached: {item.evidence.fileName}
        </p>
      ) : null}
      {item.review ? (
        <div className="space-y-3 rounded-lg border border-border bg-background p-3">
          <p className="text-sm text-text-secondary">
            Review complete. Release feedback to the family when it is ready.
          </p>
          {confirmRelease ? (
            <div className="space-y-2">
              <p className="text-sm text-text-primary">
                The family will be able to read this feedback. Release it now?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={pending}
                  onClick={() => void release()}
                >
                  {pending ? "Releasing…" : "Confirm release"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirmRelease(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              disabled={pending}
              onClick={() => setConfirmRelease(true)}
            >
              Release feedback to family
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor={`feedback-${item.versionId}`}>
              Feedback for the student
            </Label>
            <textarea
              id={`feedback-${item.versionId}`}
              className="min-h-28 w-full rounded-lg border border-border bg-background p-3 text-sm text-text-primary"
              maxLength={2000}
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`staff-note-${item.versionId}`}>
              Private staff note
            </Label>
            <textarea
              id={`staff-note-${item.versionId}`}
              className="min-h-20 w-full rounded-lg border border-border bg-background p-3 text-sm text-text-primary"
              maxLength={2000}
              value={staffNote}
              onChange={(event) => setStaffNote(event.target.value)}
              disabled={pending}
            />
            <p className="text-xs text-text-muted">
              This note is never shown to students or guardians.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending || !feedback.trim()}
              onClick={() => void submit("RETURNED")}
            >
              Return for changes
            </Button>
            <Button
              type="button"
              disabled={pending}
              onClick={() => void submit("COMPLETED")}
            >
              Complete review
            </Button>
          </div>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
