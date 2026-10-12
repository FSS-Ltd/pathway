import React from "react";
import { Badge, Card } from "@pathway/ui";
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
          className="mt-4 min-w-0 overflow-x-auto rounded-md border border-border-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-status-info focus-visible:ring-offset-2"
        >
          <table className="w-full table-fixed border-collapse text-left text-sm">
            <thead className="bg-muted text-text-primary">
              <tr>
                <th scope="col" className="w-3/4 px-3 py-2 font-semibold">
                  PACE status
                </th>
                <th
                  scope="col"
                  className="w-1/4 px-3 py-2 text-right font-semibold"
                >
                  Count
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([label, value]) => (
                <tr
                  key={label}
                  className="border-t border-border-subtle text-text-primary"
                >
                  <th scope="row" className="break-words px-3 py-2 font-medium">
                    {label}
                  </th>
                  <td className="px-3 py-2 text-right">
                    <Badge variant="default" aria-label={`${label}: ${value}`}>
                      {value}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </section>
  );
}
