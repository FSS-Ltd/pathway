import * as React from "react";
import { Button, Card } from "@pathway/ui";
import type {
  StudentOverviewResponse,
  StudentOverviewTab,
} from "../../lib/child-overview-api";
import { ChildOverviewDetail } from "./child-overview-detail";

export type OverviewSectionTab =
  | "attendance"
  | "academics"
  | "pace"
  | "behaviour"
  | "discipline"
  | "merits";

const sectionLabels: Record<OverviewSectionTab, string> = {
  attendance: "Attendance",
  academics: "Academic results",
  pace: "Subjects & PACEs",
  behaviour: "Behaviour",
  discipline: "Discipline",
  merits: "Merits activity",
};

function isOverviewSectionTab(
  tab: StudentOverviewTab,
): tab is OverviewSectionTab {
  return tab in sectionLabels;
}

function summary(
  overview: StudentOverviewResponse,
  tab: OverviewSectionTab,
): { lead: string; detail: string } {
  switch (tab) {
    case "attendance": {
      const section = overview.sections.attendance;
      return section.status === "ready"
        ? {
            lead: `${Math.round(section.data.attendanceRate)}% attendance`,
            detail: `${section.data.present} present · ${section.data.absent} absent · ${section.data.late} late`,
          }
        : { lead: "", detail: "" };
    }
    case "academics": {
      const section = overview.sections.academics;
      return section.status === "ready"
        ? {
            lead: `${section.data.reports.length} published ${section.data.reports.length === 1 ? "report" : "reports"}`,
            detail: section.data.reports[0]?.periodName ?? "",
          }
        : { lead: "", detail: "" };
    }
    case "pace": {
      const section = overview.sections.pace;
      return section.status === "ready"
        ? {
            lead: `${section.data.subjects.length} active ${section.data.subjects.length === 1 ? "subject" : "subjects"}`,
            detail: "Current PACE progress and targets",
          }
        : { lead: "", detail: "" };
    }
    case "behaviour": {
      const section = overview.sections.behaviour;
      return section.status === "ready"
        ? {
            lead: `${section.data.merits} merits · ${section.data.demerits} demerits`,
            detail: `${section.data.general} general ${section.data.general === 1 ? "record" : "records"}`,
          }
        : { lead: "", detail: "" };
    }
    case "discipline": {
      const section = overview.sections.discipline;
      return section.status === "ready"
        ? { lead: section.data.stageLabel, detail: "Current discipline stage" }
        : { lead: "", detail: "" };
    }
    case "merits": {
      const section = overview.sections.merits;
      return section.status === "ready"
        ? {
            lead: `${section.data.count} ${section.data.count === 1 ? "merit" : "merits"}`,
            detail: `${section.data.points} points recorded`,
          }
        : { lead: "", detail: "" };
    }
  }
}

function SummaryCard({
  overview,
  tab,
  onSelectTab,
  onRetry,
}: {
  overview: StudentOverviewResponse;
  tab: OverviewSectionTab;
  onSelectTab: (tab: StudentOverviewTab) => void;
  onRetry: () => void;
}) {
  const section = overview.sections[tab];
  const metric = summary(overview, tab);

  return (
    <Card className="flex min-w-0 flex-col p-5">
      <h3 className="text-base font-semibold text-text-primary">
        {sectionLabels[tab]}
      </h3>
      <div className="mt-3 flex-1">
        {section.status === "ready" ? (
          <>
            <p className="break-words text-xl font-bold text-text-primary">
              {metric.lead}
            </p>
            <p className="mt-1 text-sm text-text-muted">{metric.detail}</p>
          </>
        ) : section.status === "empty" ? (
          <p className="text-sm text-text-muted">No records for this period.</p>
        ) : section.status === "unavailable" ? (
          <p className="text-sm text-text-muted">
            {section.reason || "This section is unavailable."}
          </p>
        ) : (
          <p role="alert" className="text-sm text-status-danger">
            This section could not be loaded.
          </p>
        )}
      </div>
      {section.status === "error" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 self-start"
          onClick={onRetry}
        >
          Try again
        </Button>
      ) : section.status !== "unavailable" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-4 self-start"
          onClick={() => onSelectTab(tab)}
        >
          View {sectionLabels[tab].toLowerCase()}
        </Button>
      ) : null}
    </Card>
  );
}

export function ChildOverviewPresentation({
  overview,
  activeTab,
  onSelectTab,
  onRetry,
}: {
  overview: StudentOverviewResponse;
  activeTab: StudentOverviewTab;
  onSelectTab: (tab: StudentOverviewTab) => void;
  onRetry: () => void;
}) {
  if (activeTab !== "overview") {
    return isOverviewSectionTab(activeTab) &&
      overview.tabs.includes(activeTab) ? (
      <ChildOverviewDetail
        overview={overview}
        tab={activeTab}
        onRetry={onRetry}
      />
    ) : null;
  }

  const visibleSections = overview.tabs.filter(isOverviewSectionTab);
  return (
    <section aria-labelledby="child-progress-heading">
      <div className="mb-4">
        <h2
          id="child-progress-heading"
          className="text-lg font-bold text-text-primary"
        >
          Progress at a glance
        </h2>
        <p className="mt-1 text-sm text-text-muted">{overview.period.label}</p>
      </div>
      {visibleSections.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visibleSections.map((tab) => (
            <SummaryCard
              key={tab}
              overview={overview}
              tab={tab}
              onSelectTab={onSelectTab}
              onRetry={onRetry}
            />
          ))}
        </div>
      ) : (
        <Card className="p-5">
          <p className="text-sm text-text-muted">
            No progress sections are available for this record.
          </p>
        </Card>
      )}
    </section>
  );
}
