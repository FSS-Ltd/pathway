import React from "react";
import { Badge, Card, DataTable, type ColumnDef } from "@pathway/ui";
import type { AceDashboardResponse } from "@/lib/api-client";

export type PaceStatusTableProps = {
  pace: AceDashboardResponse["pace"];
};

export function PaceStatusTable({ pace }: PaceStatusTableProps) {
  const rows = [
    ["Ahead", pace.ahead],
    ["On track", pace.onTrack],
    ["At risk", pace.atRisk],
    ["Behind", pace.behind],
    ["Blocked", pace.blocked],
    ["Stale", pace.stale],
  ] as const;
  const columns: ColumnDef<(typeof rows)[number]>[] = [
    { id: "status", header: "PACE status", cell: ([label]) => label },
    {
      id: "count",
      header: "Count",
      cell: ([label, value]) => (
        <Badge variant="default" aria-label={`${label}: ${value}`}>
          {value}
        </Badge>
      ),
      align: "right",
    },
  ];

  return (
    <section aria-labelledby="ace-pace-heading" className="min-w-0">
      <Card className="min-w-0">
        <h2
          id="ace-pace-heading"
          className="font-heading text-lg font-semibold text-text-primary"
        >
          PACE progress
        </h2>
        <div
          role="region"
          aria-label="PACE status table"
          tabIndex={0}
          className="mt-4 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info"
        >
          <DataTable
            data={[...rows]}
            columns={columns}
            caption="PACE status counts"
            rowKey={([label]) => label}
          />
        </div>
      </Card>
    </section>
  );
}
