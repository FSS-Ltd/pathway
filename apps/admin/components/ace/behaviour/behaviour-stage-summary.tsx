import React from "react";
import type { AdminDemeritStatus } from "@/lib/api-client";
import { formatSiteDateTime } from "./behaviour-time";

export type StageView =
  | { kind: "idle" | "loading" | "denied" | "error" }
  | { kind: "ready"; value: AdminDemeritStatus | null };

export function BehaviourStageSummary({
  status,
  date,
  today,
  siteTimeZone,
  onRetry,
}: {
  status: StageView;
  date: string;
  today: string;
  siteTimeZone: string;
  onRetry: () => void;
}) {
  if (status.kind === "loading") {
    return (
      <p className="mt-5 text-sm text-text-muted" role="status">
        Loading stage…
      </p>
    );
  }
  if (status.kind === "denied") {
    return (
      <p className="mt-5 text-sm text-red-700" role="alert">
        Stage access is no longer available.
      </p>
    );
  }
  if (status.kind === "error") {
    return (
      <div className="mt-5" role="alert">
        <p className="text-sm text-red-700">Unable to load the stage.</p>
        <button
          className="mt-2 text-sm font-medium text-primary underline"
          type="button"
          onClick={onRetry}
        >
          Try again
        </button>
      </div>
    );
  }
  if (status.kind !== "ready") return null;
  const current = status.value;
  if (!current) {
    return (
      <p className="mt-5 rounded-md bg-muted p-4 text-sm text-text-muted">
        No demerit policy applies on this date.
      </p>
    );
  }
  return (
    <div className="mt-5 rounded-md border border-border p-4">
      <p className="text-sm text-text-muted">Current stage · {current.date}</p>
      <p className="mt-1 font-heading text-xl font-semibold text-text-primary">
        {current.stageLabel}
      </p>
      {current.headReview ? (
        <p
          className="mt-3 rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-text-primary"
          role="status"
        >
          Head review is required for this stage.
        </p>
      ) : null}
      {current.manualStage !== null && current.manualExpiresAt ? (
        <p className="mt-3 text-sm text-text-muted">
          Manual stage {current.manualStage} ends{" "}
          {formatSiteDateTime(current.manualExpiresAt, siteTimeZone)}.
        </p>
      ) : null}
      {current.requiresNote ? (
        <p className="mt-2 text-sm text-text-muted">
          A note is required when recording a demerit at this stage.
        </p>
      ) : null}
      {date !== today ? (
        <p className="mt-4 text-sm text-text-muted">
          Escalation is available only for the current site-local date.
        </p>
      ) : null}
    </div>
  );
}
