"use client";

import React from "react";
import { Label } from "@pathway/ui";
import {
  AdminBehaviourApiError,
  type AdminBehaviourReviewResponse,
  type AdminDemeritOverrideInput,
  type AdminDemeritOverrideResponse,
  type AdminDemeritStatus,
} from "@/lib/api-client";
import { toSiteDateTimeInput } from "./behaviour-time";
import { BehaviourReviewList, type ReviewView } from "./behaviour-review-list";
import { BehaviourStageEscalation } from "./behaviour-stage-escalation";
import {
  BehaviourStageSummary,
  type StageView,
} from "./behaviour-stage-summary";

type BehaviourStageReviewProps = {
  children: Array<{ id: string; fullName: string }>;
  siteTimeZone: string;
  canSensitive: boolean;
  canManagePolicy: boolean;
  refreshKey: number;
  loadStatus: (
    childId: string,
    date: string,
  ) => Promise<AdminDemeritStatus | null>;
  loadRequests: (
    childId: string,
    cursor?: string,
  ) => Promise<AdminBehaviourReviewResponse>;
  saveOverride: (
    input: AdminDemeritOverrideInput,
  ) => Promise<AdminDemeritOverrideResponse>;
  onSaved: () => Promise<void> | void;
};

export function BehaviourStageReview({
  children,
  siteTimeZone,
  canSensitive,
  canManagePolicy,
  refreshKey,
  loadStatus,
  loadRequests,
  saveOverride,
  onSaved,
}: BehaviourStageReviewProps) {
  const [childId, setChildId] = React.useState("");
  const [date, setDate] = React.useState(() => siteToday(siteTimeZone));
  const [status, setStatus] = React.useState<StageView>({ kind: "idle" });
  const [reviews, setReviews] = React.useState<ReviewView>({ kind: "idle" });
  const [reloadKey, setReloadKey] = React.useState(0);
  const [savingOverride, setSavingOverride] = React.useState(false);
  const today = siteToday(siteTimeZone);

  React.useEffect(() => {
    if (!childId || !canSensitive) {
      setStatus({ kind: "idle" });
      setReviews({ kind: "idle" });
      return;
    }
    let active = true;
    setStatus((current) =>
      current.kind === "ready" ? current : { kind: "loading" },
    );
    setReviews(canManagePolicy ? { kind: "loading" } : { kind: "denied" });
    void loadStatus(childId, date)
      .then((value) => {
        if (active) setStatus({ kind: "ready", value });
      })
      .catch((cause: unknown) => {
        if (active) setStatus({ kind: isDenied(cause) ? "denied" : "error" });
      });
    if (canManagePolicy) {
      void loadRequests(childId)
        .then((response) => {
          if (active) setReviews({ kind: "ready", ...response });
        })
        .catch((cause: unknown) => {
          if (active)
            setReviews({ kind: isDenied(cause) ? "denied" : "error" });
        });
    }
    return () => {
      active = false;
    };
  }, [
    childId,
    date,
    canSensitive,
    canManagePolicy,
    refreshKey,
    reloadKey,
    loadStatus,
    loadRequests,
  ]);

  const selectChild = (nextChildId: string) => {
    setStatus({ kind: "idle" });
    setReviews({ kind: "idle" });
    setChildId(nextChildId);
  };
  const selectDate = (nextDate: string) => {
    setStatus({ kind: "idle" });
    setReviews({ kind: "idle" });
    setDate(nextDate);
  };
  const retry = () => setReloadKey((current) => current + 1);
  const current = status.kind === "ready" ? status.value : null;
  const canEscalate =
    canManagePolicy && reviews.kind === "ready" && date === today;

  return (
    <section
      className="rounded-lg border border-border bg-surface p-5"
      aria-labelledby="behaviour-stage-heading"
    >
      <h2
        id="behaviour-stage-heading"
        className="font-heading text-lg font-semibold text-text-primary"
      >
        Demerit stage and review
      </h2>
      <p className="mt-1 text-sm text-text-muted">
        View a learner’s site-local stage. Current Head and Lead reviewers can
        escalate today’s stage.
      </p>
      {!canSensitive ? (
        <p
          className="mt-5 rounded-md bg-muted p-4 text-sm text-text-muted"
          role="status"
        >
          Stage details require sensitive behaviour access.
        </p>
      ) : (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="behaviour-stage-child">Learner</Label>
              <select
                id="behaviour-stage-child"
                className={controlClassName}
                value={childId}
                disabled={savingOverride}
                onChange={(event) => selectChild(event.target.value)}
              >
                <option value="">Choose a learner</option>
                {children.map((child) => (
                  <option key={child.id} value={child.id}>
                    {child.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="behaviour-stage-date">Site-local date</Label>
              <input
                id="behaviour-stage-date"
                className={controlClassName}
                type="date"
                value={date}
                max={today}
                disabled={savingOverride}
                onChange={(event) => selectDate(event.target.value)}
              />
            </div>
          </div>
          {!childId ? (
            <p className="mt-5 text-sm text-text-muted">
              Choose a learner to view their stage.
            </p>
          ) : null}
          {childId ? (
            <BehaviourStageSummary
              status={status}
              date={date}
              today={today}
              siteTimeZone={siteTimeZone}
              onRetry={retry}
            />
          ) : null}
          {childId && current ? (
            <BehaviourStageEscalation
              key={`${childId}-${date}`}
              childId={childId}
              date={date}
              siteTimeZone={siteTimeZone}
              status={current}
              allowed={canEscalate}
              saveOverride={saveOverride}
              onDenied={() => setReviews({ kind: "denied" })}
              onConflict={retry}
              onPendingChange={setSavingOverride}
              onSaved={async () => {
                await onSaved();
                retry();
              }}
            />
          ) : null}
          {childId && canManagePolicy ? (
            <BehaviourReviewList
              key={childId}
              childId={childId}
              siteTimeZone={siteTimeZone}
              reviews={reviews}
              loadRequests={loadRequests}
              onDenied={() => setReviews({ kind: "denied" })}
              onRetry={retry}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function siteToday(timeZone: string): string {
  return toSiteDateTimeInput(new Date().toISOString(), timeZone).slice(0, 10);
}

function isDenied(cause: unknown): boolean {
  return (
    cause instanceof AdminBehaviourApiError &&
    (cause.status === 401 || cause.status === 403)
  );
}

const controlClassName =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
