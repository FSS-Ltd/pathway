"use client";

import { useAdminContext } from "./admin-context";
import { getAdminRoleInfoFromApiResponse, type AdminRoleInfo } from "./access";

export type UseAdminAccessResult = {
  role: AdminRoleInfo;
  userId: string | null;
  currentOrgIsMasterOrg: boolean;
  capabilities: string[];
  permissions: string[] | null;
  isLoading: boolean;
  error?: string | null;
  warning?: string | null;
};

/** Compatibility selector: all consumers observe the same loaded context. */
export function useAdminAccess(): UseAdminAccessResult {
  const { state } = useAdminContext();
  if (state.status !== "ready") {
    return {
      role: getAdminRoleInfoFromApiResponse(null),
      userId: null,
      currentOrgIsMasterOrg: false,
      capabilities: [],
      permissions: null,
      isLoading: state.status === "loading" || state.status === "switching",
      error: state.status === "error" ? state.message : null,
      warning: null,
    };
  }
  const snapshot = state.snapshot;
  return {
    role: snapshot.role,
    userId: snapshot.userId,
    currentOrgIsMasterOrg: snapshot.currentOrgIsMasterOrg,
    capabilities: snapshot.capabilities,
    permissions: snapshot.permissions,
    isLoading: false,
    error: null,
    warning: state.warning,
  };
}
