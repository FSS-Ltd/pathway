import React from "react";
import { Button } from "@pathway/ui";
import type { AceDashboardResponse } from "@/lib/api-client";
import { AttentionCards } from "./attention-cards";
import { PaceStatusTable } from "./pace-status-table";

export type AceOverviewProps = {
  dashboard: AceDashboardResponse | null;
  isLoading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

export function AceOverview({
  dashboard,
  isLoading = false,
  error = null,
  onRetry,
}: AceOverviewProps) {
  return (
    <main className="mx-auto flex min-w-0 max-w-6xl flex-col gap-4">
      <header className="min-w-0">
        <h1 className="font-heading text-2xl font-semibold text-text-primary">
          ACE overview
        </h1>
        {dashboard ? (
          <p className="break-words text-sm text-text-muted">
            {dashboard.localDate} · {dashboard.timezone}
          </p>
        ) : (
          <p className="text-sm text-text-muted">
            Daily attendance, PACE, and behaviour aggregates.
          </p>
        )}
      </header>

      {isLoading ? (
        <div
          role="status"
          aria-label="Loading ACE overview…"
          className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2"
        >
          <span className="sr-only">Loading ACE overview…</span>
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="rounded-lg border border-status-danger/30 bg-status-danger/10 p-4">
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
          {onRetry ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={onRetry}
            >
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !error && dashboard ? (
        <>
          {isZeroCountDashboard(dashboard) ? (
            <p
              role="status"
              className="rounded-lg border border-border-subtle bg-muted p-4 text-sm text-text-muted"
            >
              No activity has been recorded for this date.
            </p>
          ) : null}
          <AttentionCards
            attendance={dashboard.attendance}
            behaviour={dashboard.behaviour}
          />
          <PaceStatusTable pace={dashboard.pace} />
        </>
      ) : null}
    </main>
  );
}

function isZeroCountDashboard(dashboard: AceDashboardResponse): boolean {
  return (
    dashboard.attendance.present === 0 &&
    dashboard.attendance.absent === 0 &&
    dashboard.attendance.late === 0 &&
    dashboard.attendance.unmarked === 0 &&
    dashboard.pace.ahead === 0 &&
    dashboard.pace.onTrack === 0 &&
    dashboard.pace.atRisk === 0 &&
    dashboard.pace.behind === 0 &&
    dashboard.pace.blocked === 0 &&
    dashboard.pace.stale === 0 &&
    dashboard.behaviour.siteReview === 0 &&
    dashboard.behaviour.headReview === 0
  );
}
