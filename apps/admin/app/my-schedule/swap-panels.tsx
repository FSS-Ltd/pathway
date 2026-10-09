import React from "react";
import { Badge, Button, Select } from "@pathway/ui";
import type { AdminSwapRequestRow, SwapCandidate } from "@/lib/api-client";
import type { RequestFailure } from "@/lib/request-error";

type CandidateFormProps = {
  candidates: SwapCandidate[];
  error: RequestFailure | null;
  loading: boolean;
  selectedUserId: string;
  submitting: boolean;
  onCancel: () => void;
  onRetry: () => void;
  onSelect: (userId: string) => void;
  onSubmit: () => void;
};

export function SwapCandidateForm({
  candidates,
  error,
  loading,
  selectedUserId,
  submitting,
  onCancel,
  onRetry,
  onSelect,
  onSubmit,
}: CandidateFormProps) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-border-subtle bg-surface p-4">
      <div>
        <h3 className="font-heading text-base font-semibold text-text-primary">
          Request a swap
        </h3>
        <p className="text-sm leading-6 text-text-muted">
          Choose another active staff member at this site. They can accept or
          decline your request.
        </p>
      </div>
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-primary">{error.message}</p>
          <Button size="sm" variant="outline" onClick={onRetry}>
            Try again
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading site staff…
        </p>
      ) : candidates.length === 0 ? (
        <p className="text-sm text-text-muted">
          No other site staff can be selected for this session.
        </p>
      ) : (
        <label className="block max-w-sm space-y-1 text-sm font-medium text-text-primary">
          <span>Staff member</span>
          <Select
            value={selectedUserId}
            onChange={(event) => onSelect(event.target.value)}
            className="min-h-11 w-full"
          >
            <option value="">Choose a staff member</option>
            {candidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
              </option>
            ))}
          </Select>
        </label>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={onSubmit}
          disabled={!selectedUserId || loading || submitting || Boolean(error)}
          className="min-h-11"
        >
          {submitting ? "Sending…" : "Send request"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

const swapStatusCopy: Record<AdminSwapRequestRow["status"], string> = {
  REQUESTED: "Awaiting response",
  ACCEPTED: "Accepted",
  DECLINED: "Declined",
  CANCELLED: "Cancelled",
};

function swapSessionLabel(swap: AdminSwapRequestRow): string {
  const session = swap.assignment.session;
  const start = new Date(session.startsAt);
  if (Number.isNaN(start.getTime())) return session.title || "Session";
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const time = start.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${session.title || "Session"} · ${date}, ${time}`;
}

type SwapRequestListProps = {
  inbound: AdminSwapRequestRow[];
  outbound: AdminSwapRequestRow[];
  actionLoadingId: string | null;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
};

export function SwapRequestList({
  inbound,
  outbound,
  actionLoadingId,
  onAccept,
  onDecline,
}: SwapRequestListProps) {
  if (inbound.length === 0 && outbound.length === 0) {
    return <p className="text-sm text-text-muted">No swap requests yet.</p>;
  }

  return (
    <div className="space-y-5">
      {inbound.length > 0 ? (
        <section aria-label="Requests from colleagues" className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">
            From colleagues
          </h3>
          <ul className="space-y-2">
            {inbound.map((swap) => (
              <li
                key={swap.id}
                className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface-alt p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-text-primary">
                    {swapSessionLabel(swap)}
                  </p>
                  <p className="text-sm text-text-muted">
                    {swap.fromUser.name || "A colleague"} asked you to cover
                    this session.
                  </p>
                </div>
                {swap.status === "REQUESTED" ? (
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="min-h-11"
                      disabled={actionLoadingId === swap.id}
                      onClick={() => onAccept(swap.id)}
                      aria-label={`Accept swap for ${swapSessionLabel(swap)}`}
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-11"
                      disabled={actionLoadingId === swap.id}
                      onClick={() => onDecline(swap.id)}
                      aria-label={`Decline swap for ${swapSessionLabel(swap)}`}
                    >
                      Decline
                    </Button>
                  </div>
                ) : (
                  <Badge
                    variant={swap.status === "ACCEPTED" ? "success" : "default"}
                  >
                    {swapStatusCopy[swap.status]}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {outbound.length > 0 ? (
        <section aria-label="Requests you sent" className="space-y-2">
          <h3 className="text-sm font-semibold text-text-primary">You sent</h3>
          <ul className="space-y-2">
            {outbound.map((swap) => (
              <li
                key={swap.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-surface-alt p-4"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium text-text-primary">
                    {swapSessionLabel(swap)}
                  </p>
                  <p className="text-sm text-text-muted">
                    Sent to {swap.toUser?.name || "a colleague"}
                  </p>
                </div>
                <Badge
                  variant={swap.status === "ACCEPTED" ? "success" : "default"}
                >
                  {swapStatusCopy[swap.status]}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
