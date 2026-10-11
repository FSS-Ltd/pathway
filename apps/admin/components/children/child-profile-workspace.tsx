"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import { useSession } from "../../lib/use-session-compat";
import { useAdminAccess } from "../../lib/use-admin-access";
import { useOrgUi } from "../../lib/use-org-ui";
import { orgLabel, type OrgUiKey } from "../../lib/org-ui";
import {
  canAccessAdminSection,
  canAccessSafeguardingAdmin,
} from "../../lib/access";
import { GuardianInviteCard } from "../parents/guardian-invite-card";
import { StudentInviteCard } from "../ace/family/student-invite-card";
import { ChildProfileHeader } from "./child-profile-header";
import { ChildProfileNavigation } from "./child-profile-navigation";
import { ChildProfileOverview } from "./child-profile-overview";
import { ChildDetailsEditor } from "./child-details-editor";
import { ChildGuardianSection } from "./child-guardian-section";
import { ChildAttendanceSection } from "./child-attendance-section";
import { ChildRegistrationSection } from "./child-registration-section";
import { useChildProfile } from "./use-child-profile";

const PERSON_LABEL: Record<OrgUiKey, string> = {
  ACE_SCHOOL: "Student",
  INDEPENDENT_SCHOOL: "Student",
  STATE_SCHOOL: "Pupil",
  SCHOOL: "Student",
  NURSERY: "Child",
  CLUB: "Member",
  CHARITY: "Participant",
  CHURCH: "Child",
  UNKNOWN: "Child",
};

export function ChildProfileWorkspace({ childId }: { childId: string }) {
  const router = useRouter();
  const { data: session } = useSession();
  const {
    role,
    capabilities,
    permissions,
    isLoading: isLoadingAccess,
  } = useAdminAccess();
  const { key: orgKey, ui } = useOrgUi();
  const profile = useChildProfile(childId);
  const personLabel = PERSON_LABEL[orgKey] ?? "Child";
  const isAdmin = canAccessAdminSection(role);
  const currentUserId = (session?.user as { id?: string })?.id ?? null;
  const canEdit =
    isAdmin ||
    Boolean(
      currentUserId && profile.child?.guardianIds.includes(currentUserId),
    );
  const canInviteParent = role?.isOrgAdmin ?? false;
  const canViewAttendance = permissions?.includes("attendance.read") ?? isAdmin;
  const canViewRegistration =
    !isLoadingAccess && (isAdmin || role.isRegistrationStaff === true);
  const canInviteStudent =
    canInviteParent &&
    orgKey === "ACE_SCHOOL" &&
    capabilities.includes("ace.student.self.read");
  const canAccessSafeguarding =
    !isLoadingAccess && canAccessSafeguardingAdmin(role);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="secondary" size="sm">
          <Link href="/children" className="inline-flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back to {orgLabel(ui, "/children", "Children")}
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {canAccessSafeguarding ? (
            <Button asChild variant="outline" size="sm">
              <Link href="/safeguarding">View in Safeguarding</Link>
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void profile.load()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {profile.state === "loading" ? (
        <div
          role="status"
          aria-label="Loading profile"
          className="grid gap-4 lg:grid-cols-2"
        >
          <Card className="h-64 animate-pulse bg-surface-alt" />
          <Card className="h-64 animate-pulse bg-surface-alt" />
        </div>
      ) : null}
      {profile.state === "missing" ? (
        <Card className="p-6">
          <h1 className="text-xl font-bold text-text-primary">
            {personLabel} not found
          </h1>
          <p className="mt-2 text-sm text-text-muted">
            This profile is unavailable or has been removed.
          </p>
          <Button
            className="mt-4"
            variant="secondary"
            onClick={() => router.push("/children")}
          >
            Back to list
          </Button>
        </Card>
      ) : null}
      {profile.state === "error" ? (
        <Card className="p-6">
          <h1 className="text-xl font-bold text-text-primary">
            Unable to load profile
          </h1>
          <p role="alert" className="mt-2 text-sm text-status-danger">
            {profile.error}
          </p>
          <Button className="mt-4" onClick={() => void profile.load()}>
            Retry
          </Button>
        </Card>
      ) : null}

      {profile.state === "ready" &&
      profile.child &&
      profile.detail &&
      profile.form ? (
        <>
          <header>
            <p className="text-xs font-semibold uppercase tracking-wider text-accent-strong">
              {personLabel} profile
            </p>
            <h1 className="mt-1 text-3xl font-bold tracking-tight text-text-primary">
              {profile.form.preferredName.trim() || profile.detail.fullName}
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              Identity, care, contacts and attendance in one place.
            </p>
          </header>
          <ChildProfileNavigation
            showAttendance={canViewAttendance}
            showRegistration={canViewRegistration}
          />
          {profile.error ? (
            <p
              role="alert"
              className="rounded-md border border-status-danger/30 bg-status-danger/10 p-3 text-sm text-status-danger"
            >
              {profile.error}
            </p>
          ) : null}
          <div className="grid items-start gap-4 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)]">
            <ChildProfileHeader
              childId={childId}
              detail={profile.detail}
              displayName={
                profile.form.preferredName.trim() || profile.detail.fullName
              }
              canEdit={canEdit}
              photoVersion={profile.photoVersion}
              isUploading={profile.isUploadingPhoto}
              onPhoto={profile.uploadPhoto}
            />
            <ChildProfileOverview
              detail={profile.detail}
              personLabel={personLabel}
            />
          </div>
          <ChildDetailsEditor
            form={profile.form}
            groups={profile.groups}
            canEdit={canEdit}
            isSaving={profile.isSaving}
            fieldErrors={profile.fieldErrors}
            onChange={profile.change}
            onSave={profile.save}
          />
          <ChildGuardianSection
            contacts={profile.detail.guardianContacts}
            invites={
              <>
                {canInviteParent ? (
                  <GuardianInviteCard childId={childId} />
                ) : null}
                {canInviteStudent ? (
                  <StudentInviteCard childId={childId} />
                ) : null}
              </>
            }
          />
          {canViewRegistration ? (
            <ChildRegistrationSection
              childId={childId}
              isAceSchool={orgKey === "ACE_SCHOOL"}
            />
          ) : null}
          {canViewAttendance ? (
            <ChildAttendanceSection childId={childId} canExport={isAdmin} />
          ) : null}
          {canAccessSafeguarding ? (
            <Card className="p-6">
              <h2 className="text-lg font-bold text-text-primary">
                Safeguarding
              </h2>
              <p className="mt-2 text-sm text-text-muted">
                Safeguarding records remain in the restricted Safeguarding
                section.
              </p>
              <Button asChild variant="outline" size="sm" className="mt-3">
                <Link href="/safeguarding">View in Safeguarding</Link>
              </Button>
            </Card>
          ) : null}
          {/* Finance and Child Merit Market profile sections belong to their separately entitled modules. */}
        </>
      ) : null}
    </div>
  );
}
