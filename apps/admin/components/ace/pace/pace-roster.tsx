import React from "react";
import { Badge, Button, Card } from "@pathway/ui";
import type {
  AdminPaceExceptionItem,
  AdminPaceRosterItem,
} from "@/lib/api-client";

type PaceRosterProps = {
  isLoading: boolean;
  items: AdminPaceRosterItem[];
  exceptions: AdminPaceExceptionItem[];
  error: string | null;
  canRecord: boolean;
  canCorrect: boolean;
  onRecord: (item: AdminPaceRosterItem) => void;
  onCorrect: (assessmentId: string, item: AdminPaceRosterItem) => void;
  onRetry: () => void;
};

export function PaceRoster({
  isLoading,
  items,
  exceptions,
  error,
  canRecord,
  canCorrect,
  onRecord,
  onCorrect,
  onRetry,
}: PaceRosterProps) {
  const byPlacement = new Map(
    items.map((item) => [`${item.child.id}:${item.subject.id}`, item]),
  );

  return (
    <div className="space-y-4">
      <Card
        title="PACE roster"
        description="Record assessments against an active student subject placement. Site policy is evaluated by the server when you submit."
      >
        <div className="space-y-4">
          {isLoading ? (
            <div className="space-y-2" aria-label="Loading PACE roster…">
              <span className="block h-3 w-48 animate-pulse rounded bg-muted" />
              <span className="block h-20 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : null}
          {error ? (
            <div
              className="flex flex-wrap items-center justify-between gap-3"
              role="alert"
            >
              <p className="text-sm text-status-danger">{error}</p>
              <Button type="button" variant="secondary" onClick={onRetry}>
                Retry roster
              </Button>
            </div>
          ) : null}
          {!isLoading && items.length === 0 ? (
            <p className="text-sm text-text-muted">
              No active PACE placements are available for this site.
            </p>
          ) : null}
          {!isLoading && items.length > 0 ? (
            <ul className="space-y-3" aria-label="PACE roster">
              {items.map((item) => (
                <li
                  className="rounded-md border border-border-subtle p-3"
                  key={`${item.child.id}:${item.subject.id}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-text-primary">
                          {item.child.displayName}
                        </p>
                        <Badge variant={statusVariant(item.status)}>
                          {item.status?.replace("_", " ") ?? "Not assessed"}
                        </Badge>
                      </div>
                      <p className="mt-1 text-sm text-text-muted">
                        {item.subject.name} · PACE {item.currentPace} of{" "}
                        {item.targetPace}
                        {item.group ? ` · ${item.group.name}` : ""}
                      </p>
                    </div>
                    {canRecord ? (
                      <Button type="button" onClick={() => onRecord(item)}>
                        Record assessment
                      </Button>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          {!canRecord ? (
            <p className="text-sm text-text-muted">
              You need ACE PACE record permission to record an assessment.
            </p>
          ) : null}
        </div>
      </Card>

      <Card
        title="PACE exceptions"
        description="Review placements that are behind, blocked, stale, or need attention. Corrections create a linked record and never overwrite history."
      >
        {isLoading ? null : exceptions.length === 0 ? (
          <p className="text-sm text-text-muted">
            No PACE exceptions need review.
          </p>
        ) : (
          <ul className="space-y-3" aria-label="PACE exceptions">
            {exceptions.map((exception) => {
              const item = byPlacement.get(
                `${exception.child.id}:${exception.subject.id}`,
              );
              return (
                <li
                  className="rounded-md border border-border-subtle p-3"
                  key={exception.enrollmentId}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-text-primary">
                        {exception.subject.name} · PACE {exception.currentPace}{" "}
                        of {exception.targetPace}
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        {exception.exceptions.join(", ")}
                        {exception.blockCode ? ` · ${exception.blockCode}` : ""}
                      </p>
                    </div>
                    {canCorrect && exception.lastAssessmentId && item ? (
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() =>
                          onCorrect(exception.lastAssessmentId!, item)
                        }
                      >
                        Correct assessment
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {!canCorrect ? (
          <p className="mt-4 text-sm text-text-muted">
            You need ACE PACE correction permission to correct an assessment.
          </p>
        ) : null}
      </Card>
    </div>
  );
}

function statusVariant(status: AdminPaceRosterItem["status"]) {
  if (status === "BLOCKED") return "danger";
  if (status === "BEHIND" || status === "AT_RISK") return "warning";
  if (status === "AHEAD" || status === "ON_TRACK") return "success";
  return "secondary";
}
