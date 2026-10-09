import React from "react";
import { Badge, Button } from "@pathway/ui";
import type { AdminAssignmentRow } from "@/lib/api-client";
import { SessionRotaKindBadge } from "@/components/session-rota-kind";

const statusCopy: Record<AdminAssignmentRow["status"], string> = {
  pending: "Pending",
  confirmed: "Accepted",
  declined: "Declined",
};

const statusTone: Record<
  AdminAssignmentRow["status"],
  "default" | "warning" | "success"
> = {
  pending: "warning",
  confirmed: "success",
  declined: "default",
};

function formatTimeRange(startsAt?: string, endsAt?: string): string {
  if (!startsAt || !endsAt) return "Time not set";
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return "Time not set";
  }
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const startTime = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const endTime = end.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} · ${startTime}–${endTime}`;
}

type AssignmentListProps = {
  assignments: AdminAssignmentRow[];
  activeSwapAssignmentId: string | null;
  busyAssignmentId: string | null;
  swapForm: React.ReactNode;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onRequestSwap: (id: string) => void;
};

export function AssignmentList({
  assignments,
  activeSwapAssignmentId,
  busyAssignmentId,
  swapForm,
  onAccept,
  onDecline,
  onRequestSwap,
}: AssignmentListProps) {
  return (
    <ul className="space-y-3">
      {assignments.map((assignment) => {
        const isBusy = busyAssignmentId === assignment.id;
        const title =
          assignment.rotaKind && assignment.rotaKind !== "STANDARD"
            ? (assignment.sessionTitle ?? "Staff shift")
            : (assignment.sessionGroupName ??
              assignment.sessionTitle ??
              "Session");
        return (
          <li
            key={assignment.id}
            className="flex flex-col gap-3 rounded-lg border border-l-4 border-border-subtle bg-surface-alt p-4"
            style={
              assignment.sessionGroupColor
                ? { borderLeftColor: assignment.sessionGroupColor }
                : undefined
            }
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-medium text-text-primary">{title}</p>
                  <SessionRotaKindBadge kind={assignment.rotaKind} />
                </div>
                <p className="text-sm text-text-muted">
                  {formatTimeRange(assignment.startsAt, assignment.endsAt)}
                </p>
              </div>
              <Badge variant={statusTone[assignment.status]}>
                {statusCopy[assignment.status]}
              </Badge>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {assignment.status === "pending" ? (
                <>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="min-h-11"
                    onClick={() => onAccept(assignment.id)}
                    disabled={isBusy}
                    aria-label={`Accept ${title}`}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-h-11"
                    onClick={() => onDecline(assignment.id)}
                    disabled={isBusy}
                    aria-label={`Decline ${title}`}
                  >
                    Decline
                  </Button>
                </>
              ) : null}
              {assignment.status !== "declined" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-11"
                  onClick={() => onRequestSwap(assignment.id)}
                  disabled={isBusy}
                  aria-label={`Request swap for ${title}`}
                >
                  Request swap
                </Button>
              ) : null}
            </div>
            {activeSwapAssignmentId === assignment.id ? swapForm : null}
          </li>
        );
      })}
    </ul>
  );
}
