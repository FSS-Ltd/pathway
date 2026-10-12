"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@pathway/ui";
import { GuardianInviteCard } from "../parents/guardian-invite-card";
import { StudentInviteCard } from "../ace/family/student-invite-card";
import { ChildProfileHeader } from "./child-profile-header";
import {
  ChildProfileNavigation,
  type ChildProfileTab,
  type ChildProfileTabId,
} from "./child-profile-navigation";
import { ChildProfileStatus } from "./child-profile-status";
import { ChildDetailsEditor } from "./child-details-editor";
import { ChildGuardianSection } from "./child-guardian-section";
import { ChildAttendanceSection } from "./child-attendance-section";
import { ChildRegistrationSection } from "./child-registration-section";
import { useChildProfileAccess } from "./use-child-profile-access";
import { useChildProfile } from "./use-child-profile";

export function ChildProfileWorkspace({ childId }: { childId: string }) {
  const profile = useChildProfile(childId);
  const access = useChildProfileAccess(profile.child?.guardianIds);
  const [selectedTab, setSelectedTab] =
    React.useState<ChildProfileTabId>("details");
  const tabs: ChildProfileTab[] = [
    { id: "details", label: "Details" },
    { id: "contacts", label: "Contacts" },
    ...(access.canViewRegistration
      ? [{ id: "registration" as const, label: "Registration" }]
      : []),
    ...(access.canViewAttendance
      ? [{ id: "attendance" as const, label: "Attendance" }]
      : []),
  ];
  const activeTab = tabs.some((tab) => tab.id === selectedTab)
    ? selectedTab
    : "details";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link
            href={`/children/${encodeURIComponent(childId)}`}
            className="inline-flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to record
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {access.canAccessSafeguarding ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/safeguarding">View in Safeguarding</Link>
            </Button>
          ) : null}
          {profile.state === "ready" ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void profile.load()}
            >
              Refresh
            </Button>
          ) : null}
        </div>
      </div>
      {profile.state !== "ready" ? (
        <ChildProfileStatus
          state={profile.state}
          error={profile.error}
          personLabel={access.personLabel}
          onRetry={() => void profile.load()}
        />
      ) : profile.child && profile.detail && profile.form ? (
        <>
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-strong">
              {access.personLabel} profile
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
              {profile.form.preferredName.trim() || profile.detail.fullName}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              {access.canEdit
                ? "Update profile details and review linked records."
                : "Profile details are read only for your role."}
            </p>
          </header>
          <ChildProfileNavigation
            tabs={tabs}
            activeTab={activeTab}
            onChange={setSelectedTab}
            label="Profile sections"
          />
          {profile.error ? (
            <p
              role="alert"
              className="rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger"
            >
              {profile.error}
            </p>
          ) : null}
          <div
            id="child-profile-panel"
            role="tabpanel"
            aria-labelledby={`child-profile-tab-${activeTab}`}
            tabIndex={0}
          >
            {activeTab === "details" ? (
              <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
                <ChildProfileHeader
                  childId={childId}
                  detail={profile.detail}
                  displayName={
                    profile.form.preferredName.trim() || profile.detail.fullName
                  }
                  canEdit={access.canEdit}
                  photoVersion={profile.photoVersion}
                  isUploading={profile.isUploadingPhoto}
                  onPhoto={profile.uploadPhoto}
                />
                <ChildDetailsEditor
                  form={profile.form}
                  groups={profile.groups}
                  canEdit={access.canEdit}
                  isSaving={profile.isSaving}
                  fieldErrors={profile.fieldErrors}
                  onChange={profile.change}
                  onSave={profile.save}
                />
              </div>
            ) : null}
            {activeTab === "contacts" ? (
              <ChildGuardianSection
                contacts={profile.detail.guardianContacts}
                invites={
                  <>
                    {access.canInviteParent ? (
                      <GuardianInviteCard childId={childId} />
                    ) : null}
                    {access.canInviteStudent ? (
                      <StudentInviteCard childId={childId} />
                    ) : null}
                  </>
                }
              />
            ) : null}
            {activeTab === "registration" ? (
              <ChildRegistrationSection
                childId={childId}
                isAceSchool={access.orgKey === "ACE_SCHOOL"}
              />
            ) : null}
            {activeTab === "attendance" ? (
              <ChildAttendanceSection
                childId={childId}
                canExport={access.isAdmin}
              />
            ) : null}
            {/* Finance and Child Merit Market join here after their own entitlement and data modules ship. */}
          </div>
        </>
      ) : null}
    </div>
  );
}
