"use client";

import { useSession } from "../../lib/use-session-compat";
import { useAdminAccess } from "../../lib/use-admin-access";
import { useOrgUi } from "../../lib/use-org-ui";
import {
  canAccessAdminSection,
  canAccessSafeguardingAdmin,
} from "../../lib/access";
import { childProfileLabel } from "./child-profile-label";

export function useChildProfileAccess(guardianIds?: readonly string[]) {
  const { data: session } = useSession();
  const {
    role,
    capabilities,
    permissions,
    isLoading: isLoadingAccess,
  } = useAdminAccess();
  const { key: orgKey, ui } = useOrgUi();
  const isAdmin = canAccessAdminSection(role);
  const currentUserId = (session?.user as { id?: string })?.id ?? null;
  const canEdit =
    isAdmin ||
    role.isRegistrationStaff === true ||
    Boolean(currentUserId && guardianIds?.includes(currentUserId));
  const canInviteParent = role.isOrgAdmin;

  return {
    personLabel: childProfileLabel(orgKey),
    orgKey,
    ui,
    isAdmin,
    canEdit,
    canInviteParent,
    canInviteStudent:
      canInviteParent &&
      orgKey === "ACE_SCHOOL" &&
      capabilities.includes("ace.student.self.read"),
    canViewAttendance: permissions?.includes("attendance.read") ?? isAdmin,
    canViewRegistration:
      !isLoadingAccess && (isAdmin || role.isRegistrationStaff === true),
    canAccessSafeguarding: !isLoadingAccess && canAccessSafeguardingAdmin(role),
  };
}
