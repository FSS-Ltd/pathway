"use client";

import React from "react";
import { Badge, Button, Card, DataTable, type ColumnDef } from "@pathway/ui";
import {
  fetchAccessAuditEvents,
  type AdminAccessAuditEvent,
  type PersonRow,
} from "@/lib/api-client";
import { formatAuditTimestamp } from "@/lib/roles";
import { requestFailure } from "@/lib/request-error";

export type AuditLogPanelProps = {
  people: PersonRow[];
};

function actorLabel(people: PersonRow[], actorUserId: string): string {
  return people.find((p) => p.id === actorUserId)?.name ?? actorUserId;
}

function actionLabel(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function AuditLogPanel({ people }: AuditLogPanelProps) {
  const [events, setEvents] = React.useState<AdminAccessAuditEvent[]>([]);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isLoadingMore, setIsLoadingMore] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await fetchAccessAuditEvents();
      setEvents(result.items);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(requestFailure(err, "Unable to load the audit log.").message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleLoadMore = async () => {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const result = await fetchAccessAuditEvents({ cursor: nextCursor });
      setEvents((prev) => [...prev, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (err) {
      setError(
        requestFailure(err, "Unable to load more audit events.").message,
      );
    } finally {
      setIsLoadingMore(false);
    }
  };

  const columns: ColumnDef<AdminAccessAuditEvent>[] = [
    {
      id: "when",
      header: "When",
      cell: (row) => (
        <span className="text-sm text-text-secondary">
          {formatAuditTimestamp(row.createdAt)}
        </span>
      ),
      width: "160px",
    },
    {
      id: "actor",
      header: "Actor",
      cell: (row) => (
        <span className="text-sm text-text-primary">
          {actorLabel(people, row.actorUserId)}
        </span>
      ),
    },
    {
      id: "entityType",
      header: "Type",
      cell: (row) => (
        <Badge variant={row.entityType === "ORG_ROLE" ? "accent" : "default"}>
          {row.entityType === "ORG_ROLE" ? "Role" : "Assignment"}
        </Badge>
      ),
      width: "110px",
    },
    {
      id: "action",
      header: "Action",
      cell: (row) => (
        <span className="text-sm text-text-secondary">
          {actionLabel(row.action)}
        </span>
      ),
      width: "160px",
    },
  ];

  return (
    <Card title="Audit log" description="Recent role and assignment changes">
      {error && (
        <div className="mb-3 rounded-md border border-status-danger/30 bg-status-danger/10 px-3 py-2 text-sm text-status-danger">
          {error}
        </div>
      )}
      {isLoading ? (
        <div className="py-8 text-center text-sm text-text-muted">
          Loading...
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            data={events}
            emptyMessage="No audit events yet."
          />
          {nextCursor && (
            <div className="mt-3 flex justify-center">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleLoadMore}
                disabled={isLoadingMore}
              >
                {isLoadingMore ? "Loading…" : "Load more"}
              </Button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
