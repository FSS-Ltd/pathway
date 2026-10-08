import React from "react";
import { Badge, Card } from "@pathway/ui";
import type { FamilyDailyAttendanceHistory } from "@/lib/family-daily-attendance-api";

const reasonLabels = {
  SICK: "Sick",
  HOLIDAY: "Holiday",
  NOT_SCHEDULED: "Not scheduled",
  EXCUSED: "Excused",
  UNEXCUSED: "Unexcused",
} as const;

const statusDetails = {
  PRESENT: { label: "Present", variant: "success" },
  ABSENT: { label: "Absent", variant: "danger" },
  LATE: { label: "Late", variant: "warning" },
} as const;

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

export function FamilyAttendanceResults({
  data,
}: {
  data: FamilyDailyAttendanceHistory;
}) {
  return (
    <>
      <section
        aria-label="Recorded attendance summary"
        className="grid gap-3 sm:grid-cols-3"
      >
        {(
          [
            ["Present", data.counts.present],
            ["Absent", data.counts.absent],
            ["Late", data.counts.late],
          ] as const
        ).map(([label, count]) => (
          <Card key={label}>
            <p className="text-sm text-text-muted">{label}</p>
            <p className="mt-1 font-heading text-3xl font-semibold tabular-nums">
              {count}
            </p>
          </Card>
        ))}
      </section>
      <Card
        title="Recorded days"
        description={`${formatDate(data.from)} to ${formatDate(data.to)}`}
      >
        {data.items.length === 0 ? (
          <p className="text-sm text-text-muted">
            No daily marks were recorded in this period.
          </p>
        ) : (
          <ol className="divide-y divide-border-subtle">
            {data.items.map((item) => (
              <li
                key={item.date}
                className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <time
                  dateTime={item.date}
                  className="font-medium text-text-primary"
                >
                  {formatDate(item.date)}
                </time>
                <div className="flex items-center gap-2">
                  {item.absenceReason && (
                    <span className="text-sm text-text-muted">
                      {reasonLabels[item.absenceReason]}
                    </span>
                  )}
                  <Badge variant={statusDetails[item.status].variant}>
                    {statusDetails[item.status].label}
                  </Badge>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </>
  );
}
