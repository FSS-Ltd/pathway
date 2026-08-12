import React from "react";
import { Badge, Card } from "@pathway/ui";
import type { AceDashboardResponse } from "@/lib/api-client";

export type AttentionCardsProps = {
  attendance: AceDashboardResponse["attendance"];
  behaviour: AceDashboardResponse["behaviour"];
};

export function AttentionCards({ attendance, behaviour }: AttentionCardsProps) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
      <section aria-labelledby="ace-attendance-heading" className="min-w-0">
        <Card className="h-full min-w-0">
          <h2
            id="ace-attendance-heading"
            className="font-heading text-lg font-semibold text-text-primary"
          >
            Attendance
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AttentionValue label="Present" value={attendance.present} />
            <AttentionValue label="Absent" value={attendance.absent} />
            <AttentionValue label="Late" value={attendance.late} />
            <AttentionValue label="Unmarked" value={attendance.unmarked} />
          </dl>
        </Card>
      </section>

      <section aria-labelledby="ace-behaviour-heading" className="min-w-0">
        <Card className="h-full min-w-0">
          <h2
            id="ace-behaviour-heading"
            className="font-heading text-lg font-semibold text-text-primary"
          >
            Behaviour attention
          </h2>
          <dl className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <AttentionValue label="Site review" value={behaviour.siteReview} />
            <AttentionValue label="Head review" value={behaviour.headReview} />
          </dl>
        </Card>
      </section>
    </div>
  );
}

function AttentionValue({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-md border border-border-subtle p-3">
      <dt className="min-w-0 text-sm font-medium text-text-primary">
        {label}:
      </dt>
      <dd>
        <Badge variant="default" aria-label={`${label}: ${value}`}>
          {value}
        </Badge>
      </dd>
    </div>
  );
}
