/**
 * React hook for admin access control
 * 
 * Fetches user roles from the API (queries UserOrgRole, UserTenantRole, OrgMembership, SiteMembership tables)
 * and provides role information and loading state.
 */

"use client";

import { useState, useEffect, useMemo } from "react";
import { useSession } from "@/lib/use-session-compat";
import {
  type AdminRoleInfo,
  getAdminRoleInfoFromApiResponse,
} from "./access";
import {
  fetchMyPermissions,
  fetchOrgCapabilities,
  fetchUserRoles,
  type UserRolesResponse,
} from "./api-client";
import { loadAdminAccessIndependently } from "./admin-access-loader";
import { subscribeToActiveSiteChanges } from "./active-site-events";
import { getRoleLookupFailureStatus } from "./role-lookup-status";

export type UseAdminAccessResult = {
  role: AdminRoleInfo;
  /** Current user's ID (from API roles response). */
  userId: string | null;
  /** True when current org is a master/internal org (no billing, unlimited). */
  currentOrgIsMasterOrg: boolean;
  capabilities: string[];
  /** The actor's own effective permissions; null while not yet loaded (nav stays advisory until then). */
  permissions: string[] | null;
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
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [permissions, setPermissions] = useState<string[] | null>(null);
  const [activeSiteRevision, setActiveSiteRevision] = useState(0);
  const [isLoadingRoles, setIsLoadingRoles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(
    () =>
      subscribeToActiveSiteChanges(() => {
        setActiveSiteRevision((revision) => revision + 1);
      }),
    [],
  );

  useEffect(() => {
    const sessionRoles =
      (session as { roles?: UserRolesResponse } | null)?.roles ?? null;
    const accessToken =
      (session as { accessToken?: string } | null)?.accessToken ?? null;

    // Only fetch roles when session is authenticated
    if (sessionStatus !== "authenticated" || !session) {
      setRolesResponse(null);
      setCapabilities([]);
      setPermissions(null);
      setError(null);
      setWarning(null);
      setIsLoadingRoles(false);
      return;
    }

    if (!accessToken) {
      setRolesResponse(null);
      setCapabilities([]);
      setPermissions(null);
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
        setCapabilities([]);
        setPermissions(null);
        await loadAdminAccessIndependently({
          loadRoles: () => fetchUserRoles(accessToken),
          loadCapabilities: () => fetchOrgCapabilities(accessToken),
          loadPermissions: () => fetchMyPermissions(accessToken),
          onRolesLoaded: (response) => {
            if (!cancelled) {
              setRolesResponse(response);
            }
          },
          onCapabilitiesLoaded: (resolvedCapabilities) => {
            if (!cancelled) {
              setCapabilities(resolvedCapabilities);
            }
          },
          onPermissionsLoaded: (resolvedPermissions) => {
            if (!cancelled) {
              setPermissions(resolvedPermissions);
            }
          },
        });
      } catch (err) {
        if (!cancelled) {
          const status = getRoleLookupFailureStatus(err, Boolean(sessionRoles));
          setError(status.error);
          setWarning(status.warning);
          setRolesResponse(null);
          setCapabilities([]);
          setPermissions(null);
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
  }, [sessionStatus, session, activeSiteRevision]);

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
    capabilities,
    permissions,
    isLoading,
    error,
    warning,
  };
}
