import * as React from "react";
import { Button, Card } from "@pathway/ui";
import type {
  StudentOverviewResponse,
  StudentOverviewSection,
} from "../../lib/child-overview-api";
import type { OverviewSectionTab } from "./child-overview-presentation";

const headings: Record<OverviewSectionTab, string> = {
  attendance: "Attendance",
  academics: "Academic results",
  pace: "Subjects & PACEs",
  behaviour: "Behaviour",
  discipline: "Discipline",
  merits: "Merits activity",
};

const paceStatusLabels: Record<string, string> = {
  AHEAD: "Ahead",
  ON_TRACK: "On track",
  AT_RISK: "At risk",
  BEHIND: "Behind",
  BLOCKED: "Blocked",
};

function Metrics({
  items,
}: {
  items: ReadonlyArray<{ label: string; value: string | number }>;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg bg-surface-alt p-4">
          <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {item.label}
          </dt>
          <dd className="mt-1 text-xl font-bold text-text-primary">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function ReadyDetail({
  overview,
  tab,
}: {
  overview: StudentOverviewResponse;
  tab: OverviewSectionTab;
}) {
  switch (tab) {
    case "attendance": {
      const section = overview.sections.attendance;
      if (section.status !== "ready") return null;
      return (
        <Metrics
          items={[
            {
              label: "Attendance rate",
              value: `${Math.round(section.data.attendanceRate)}%`,
            },
            { label: "Present", value: section.data.present },
            { label: "Absent", value: section.data.absent },
            { label: "Late", value: section.data.late },
          ]}
        />
      );
    }
    case "academics": {
      const section = overview.sections.academics;
      if (section.status !== "ready") return null;
      return (
        <ol className="divide-y divide-border-subtle">
          {section.data.reports.map((report, index) => (
            <li
              key={`${report.periodName}-${report.publishedAt}-${index}`}
              className="py-4 first:pt-0 last:pb-0"
            >
              <p className="font-semibold text-text-primary">
                {report.periodName}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                Published{" "}
                <time dateTime={report.publishedAt}>
                  {new Intl.DateTimeFormat(undefined, {
                    dateStyle: "medium",
                  }).format(new Date(report.publishedAt))}
                </time>
              </p>
              {report.summary ? (
                <p className="mt-2 whitespace-pre-wrap text-sm text-text-primary">
                  {report.summary}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      );
    }
    case "pace": {
      const section = overview.sections.pace;
      if (section.status !== "ready") return null;
      return (
        <ul className="grid gap-3 lg:grid-cols-2">
          {section.data.subjects.map((subject) => (
            <li
              key={subject.subjectId}
              className="rounded-lg border border-border-subtle p-4"
            >
              <h3 className="font-semibold text-text-primary">
                {subject.subjectName}
              </h3>
              <p className="mt-2 text-sm text-text-primary">
                Current PACE {subject.currentPace} · Target PACE{" "}
                {subject.targetPace}
              </p>
              <p className="mt-1 text-sm text-text-muted">
                {subject.completedPaces} completed
                {subject.trackStatus
                  ? ` · ${paceStatusLabels[subject.trackStatus] ?? subject.trackStatus}`
                  : ""}
              </p>
            </li>
          ))}
        </ul>
      );
    }
    case "behaviour": {
      const section = overview.sections.behaviour;
      if (section.status !== "ready") return null;
      return (
        <Metrics
          items={[
            { label: "Merits", value: section.data.merits },
            { label: "Demerits", value: section.data.demerits },
            { label: "General", value: section.data.general },
          ]}
        />
      );
    }
    case "discipline": {
      const section = overview.sections.discipline;
      if (section.status !== "ready") return null;
      return (
        <Metrics
          items={[{ label: "Current stage", value: section.data.stageLabel }]}
        />
      );
    }
    case "merits": {
      const section = overview.sections.merits;
      if (section.status !== "ready") return null;
      return (
        <Metrics
          items={[
            { label: "Merits", value: section.data.count },
            { label: "Points", value: section.data.points },
          ]}
        />
      );
    }
  }
}

export function ChildOverviewDetail({
  overview,
  tab,
  onRetry,
}: {
  overview: StudentOverviewResponse;
  tab: OverviewSectionTab;
  onRetry: () => void;
}) {
  const section: StudentOverviewSection<unknown> = overview.sections[tab];
  return (
    <section aria-labelledby={`child-${tab}-heading`}>
      <Card className="p-5 sm:p-6">
        <h2
          id={`child-${tab}-heading`}
          className="text-lg font-bold text-text-primary"
        >
          {headings[tab]}
        </h2>
        <p className="mt-1 text-sm text-text-muted">{overview.period.label}</p>
        <div className="mt-5">
          {section.status === "ready" ? (
            <ReadyDetail overview={overview} tab={tab} />
          ) : section.status === "empty" ? (
            <p className="text-sm text-text-muted">
              No records for this period.
            </p>
          ) : section.status === "unavailable" ? (
            <p className="text-sm text-text-muted">
              {section.reason || "This section is unavailable."}
            </p>
          ) : (
            <div>
              <p role="alert" className="text-sm text-status-danger">
                This section could not be loaded.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={onRetry}
              >
                Try again
              </Button>
            </div>
          )}
        </div>
      </Card>
    </section>
  );
}
