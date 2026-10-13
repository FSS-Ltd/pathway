"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import { orgLabel } from "../../lib/org-ui";
import type { StudentOverviewTab } from "../../lib/child-overview-api";
import {
  ChildProfileNavigation,
  type ChildProfileTab,
  type ChildProfileTabId,
} from "./child-profile-navigation";
import { ChildProfileOverview } from "./child-profile-overview";
import { ChildGuardianSection } from "./child-guardian-section";
import { ChildAttendanceSection } from "./child-attendance-section";
import { ChildRegistrationSection } from "./child-registration-section";
import { ChildProfileStatus } from "./child-profile-status";
import { ChildRecordHero } from "./child-record-hero";
import {
  ChildOverviewPresentation,
  type OverviewSectionTab,
} from "./child-overview-presentation";
import { useChildProfileAccess } from "./use-child-profile-access";
import { useChildRecord } from "./use-child-record";
import { useChildOverview } from "./use-child-overview";

type SupportedRecordTab = Exclude<StudentOverviewTab, "notes">;

const overviewTabLabels: Record<SupportedRecordTab, string> = {
  overview: "Overview",
  attendance: "Attendance",
  academics: "Academic results",
  contacts: "Contacts",
  registration: "Registration",
  pace: "Subjects & PACEs",
  behaviour: "Behaviour",
  discipline: "Discipline",
  merits: "Merits activity",
};

function isSupportedTab(tab: StudentOverviewTab): tab is SupportedRecordTab {
  return tab in overviewTabLabels;
}

function isSummaryTab(tab: ChildProfileTabId): tab is OverviewSectionTab {
  return (
    tab === "academics" ||
    tab === "pace" ||
    tab === "behaviour" ||
    tab === "discipline" ||
    tab === "merits"
  );
}

export function ChildRecordWorkspace({ childId }: { childId: string }) {
  const record = useChildRecord(childId);
  const summary = useChildOverview(childId);
  const access = useChildProfileAccess(record.detail?.guardianIds);
  const [selectedTab, setSelectedTab] =
    React.useState<ChildProfileTabId>("overview");
  const fallbackTabs: ChildProfileTab[] = [
    { id: "overview", label: "Overview" },
  ];
  const overview =
    summary.load.state === "ready" ? summary.load.overview : null;
  const tabs: ChildProfileTab[] = overview
    ? overview.tabs.filter(isSupportedTab).map((id) => ({
        id,
        label: overviewTabLabels[id] ?? id,
      }))
    : fallbackTabs;
  const activeTab = tabs.some((tab) => tab.id === selectedTab)
    ? selectedTab
    : "overview";

  return (
    <div className="flex w-full min-w-0 flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/children" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to {orgLabel(access.ui, "/children", "Children")}
          </Link>
        </Button>
        {record.state === "ready" ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              void record.load();
              summary.refresh();
            }}
          >
            Refresh
          </Button>
        ) : null}
      </div>
      {record.state !== "ready" ? (
        <ChildProfileStatus
          state={record.state}
          error={record.error}
          personLabel={access.personLabel}
          onRetry={() => void record.load()}
        />
      ) : record.detail ? (
        <>
          <ChildRecordHero
            childId={childId}
            detail={record.detail}
            personLabel={access.personLabel}
            canEdit={overview?.actions.includes("edit-profile") ?? false}
          />
          <ChildProfileNavigation
            tabs={tabs}
            activeTab={activeTab}
            onChange={setSelectedTab}
            label="Record sections"
          />
          <div
            id="child-profile-panel"
            role="tabpanel"
            aria-labelledby={`child-profile-tab-${activeTab}`}
            tabIndex={0}
          >
            {activeTab === "overview" ? (
              <div className="space-y-4">
                <ChildProfileOverview
                  detail={record.detail}
                  personLabel={access.personLabel}
                />
                {overview ? (
                  <ChildOverviewPresentation
                    overview={overview}
                    activeTab="overview"
                    onSelectTab={setSelectedTab}
                    onRetry={summary.refresh}
                  />
                ) : summary.load.state === "loading" ? (
                  <Card className="p-5" role="status">
                    <p className="text-sm text-text-muted">
                      Loading progress overview…
                    </p>
                  </Card>
                ) : summary.load.state === "error" ? (
                  <Card className="p-5">
                    <p role="alert" className="text-sm text-status-danger">
                      {summary.load.message}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={summary.refresh}
                    >
                      Try again
                    </Button>
                  </Card>
                ) : null}
              </div>
            ) : null}
            {activeTab === "attendance" ? (
              <ChildAttendanceSection
                childId={childId}
                canExport={access.isAdmin}
              />
            ) : null}
            {activeTab === "contacts" ? (
              <ChildGuardianSection contacts={record.detail.guardianContacts} />
            ) : null}
            {activeTab === "registration" ? (
              <ChildRegistrationSection
                childId={childId}
                isAceSchool={access.orgKey === "ACE_SCHOOL"}
              />
            ) : null}
            {overview && isSummaryTab(activeTab) ? (
              <ChildOverviewPresentation
                overview={overview}
                activeTab={activeTab}
                onSelectTab={setSelectedTab}
                onRetry={summary.refresh}
              />
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
