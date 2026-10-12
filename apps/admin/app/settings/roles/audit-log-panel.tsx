"use client";

import { Badge, Card, DataTable, type ColumnDef } from "@pathway/ui";
import {
  fetchAccessAuditEvents,
  type AdminAccessAuditEvent,
  type PersonRow,
} from "@/lib/api-client";
import { formatAuditTimestamp } from "@/lib/roles";
import { useCursorPage } from "./use-cursor-page";

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
  const auditPage = useCursorPage(
    fetchAccessAuditEvents,
    "Unable to load the audit log.",
  );

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
      priority: "secondary",
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
      priority: "secondary",
    },
  ];

  return (
    <Card title="Audit log" description="Recent role and assignment changes">
      <DataTable
        columns={columns}
        data={auditPage.items}
        caption="Access audit log"
        rowKey={(event) => event.id}
        isLoading={auditPage.isLoading}
        errorMessage={auditPage.error}
        onRetry={auditPage.refresh}
        emptyMessage="No audit events yet."
        pagination={{
          mode: "server",
          pageIndex: auditPage.pageIndex,
          pageSize: auditPage.pageSize,
          hasNextPage: auditPage.hasNextPage,
          onPageChange: auditPage.changePage,
          onPageSizeChange: auditPage.changePageSize,
        }}
      />
    </Card>
  );
}
