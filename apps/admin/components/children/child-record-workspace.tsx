"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@pathway/ui";
import { orgLabel } from "../../lib/org-ui";
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
import { useChildProfileAccess } from "./use-child-profile-access";
import { useChildRecord } from "./use-child-record";

export function ChildRecordWorkspace({ childId }: { childId: string }) {
  const record = useChildRecord(childId);
  const access = useChildProfileAccess(record.detail?.guardianIds);
  const [selectedTab, setSelectedTab] =
    React.useState<ChildProfileTabId>("overview");
  const tabs: ChildProfileTab[] = [
    { id: "overview", label: "Overview" },
    ...(access.canViewAttendance
      ? [{ id: "attendance" as const, label: "Attendance" }]
      : []),
    { id: "contacts", label: "Contacts" },
    ...(access.canViewRegistration
      ? [{ id: "registration" as const, label: "Registration" }]
      : []),
  ];
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
            onClick={() => void record.load()}
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
            canEdit={access.canEdit}
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
              <ChildProfileOverview
                detail={record.detail}
                personLabel={access.personLabel}
              />
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
            {/* Finance and Child Merit Market join here after their own entitlement and data modules ship. */}
          </div>
        </>
      ) : null}
    </div>
  );
}
