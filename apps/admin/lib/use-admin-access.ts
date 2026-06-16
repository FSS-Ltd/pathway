/**
 * React hook for admin access control
 * 
 * Fetches user roles from the API (queries UserOrgRole, UserTenantRole, OrgMembership, SiteMembership tables)
 * and provides role information and loading state.
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import {
  type AdminRoleInfo,
  getAdminRoleInfoFromApiResponse,
} from "./access";
import { fetchUserRoles, type UserRolesResponse } from "./api-client";
import { getRoleLookupFailureStatus } from "./role-lookup-status";

export type UseAdminAccessResult = {
  role: AdminRoleInfo;
  /** Current user's ID (from API roles response). */
  userId: string | null;
  /** True when current org is a master/internal org (no billing, unlimited). */
  currentOrgIsMasterOrg: boolean;
  isLoading: boolean;
  error?: string | null;
  warning?: string | null;
};

/**
 * Hook to get admin role information from the API
 * 
 * Queries the database via /auth/active-site/roles endpoint to check:
 * - UserOrgRole table (org-level roles)
 * - UserTenantRole table (site-level roles)  
 * - OrgMembership table (org-level memberships)
 * - SiteMembership table (site-level memberships)
 * 
 * Usage:
 * ```tsx
 * const { role, isLoading } = useAdminAccess();
 * 
 * if (isLoading) return <LoadingSpinner />;
 * if (!canAccessBilling(role)) return <NoAccessCard />;
 * ```
 */
export function useAdminAccess(): UseAdminAccessResult {
  const { data: session, status: sessionStatus } = useSession();
  const [rolesResponse, setRolesResponse] = useState<UserRolesResponse | null>(null);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    const sessionRoles =
      (session as { roles?: UserRolesResponse } | null)?.roles ?? null;
    const accessToken =
      (session as { accessToken?: string } | null)?.accessToken ?? null;

    // Only fetch roles when session is authenticated
    if (sessionStatus !== "authenticated" || !session) {
      setRolesResponse(null);
      setError(null);
      setWarning(null);
      setIsLoadingRoles(false);
      return;
    }

    if (!accessToken) {
      setRolesResponse(null);
      setIsLoadingRoles(false);
      if (!sessionRoles) {
        setError("Missing API access token for role lookup.");
        setWarning(null);
      } else {
        setError(null);
        setWarning(
          "Missing API access token for role lookup. Using saved session roles.",
        );
      }
      return;
    }

    let cancelled = false;

    async function loadRoles() {
      try {
        setIsLoadingRoles(true);
        setError(null);
        setWarning(null);
        const response = await fetchUserRoles(accessToken);
        if (!cancelled) {
          setRolesResponse(response);
        }
      } catch (err) {
        if (!cancelled) {
          const status = getRoleLookupFailureStatus(err, Boolean(sessionRoles));
          setError(status.error);
          setWarning(status.warning);
          setRolesResponse(null);
        }
      } finally {
        if (!cancelled) {
          setIsLoadingRoles(false);
        }
      }
    }

    void loadRoles();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus, session]);

  // Use API response when available; fall back to roles from session (set at login)
  const rolesSource =
    rolesResponse ?? (session as { roles?: UserRolesResponse })?.roles;

  const role = useMemo(
    () => getAdminRoleInfoFromApiResponse(rolesSource),
    [rolesSource],
  );

  const currentOrgIsMasterOrg = rolesSource?.currentOrgIsMasterOrg ?? false;
  // Consider loaded when we have roles from session or API
  const hasRoles = !!rolesSource;
  const isLoading =
    sessionStatus === "loading" || (isLoadingRoles && !hasRoles);

  const userId = rolesSource?.userId ?? null;

  return {
    role,
    userId,
    currentOrgIsMasterOrg,
    isLoading,
    error,
    warning,
  };
}
