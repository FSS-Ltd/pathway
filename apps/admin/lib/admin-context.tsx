"use client";

import React from "react";
import {
  fetchActiveSiteState,
  fetchMyPermissions,
  fetchOrgCapabilities,
  fetchOrgOverview,
  fetchUserRoles,
  setActiveSite,
  type ActiveSiteState,
  type AdminOrgOverview,
  type SiteOption,
  type UserRolesResponse,
} from "./api-client";
import { getAdminRoleInfoFromApiResponse, type AdminRoleInfo } from "./access";
import { ApiError, cancelApiReads } from "./api-transport";
import { subscribeToAccessChanges } from "./access-change-events";
import {
  resolveOrgUi,
  resolveOrgUiKey,
  type OrgUi,
  type OrgUiKey,
} from "./org-ui";
import { useSession, type SessionContextValue } from "./use-session-compat";

const FRESHNESS_MS = 5 * 60_000;

export type AdminSnapshot = {
  userId: string;
  isSuperUser: boolean;
  activeSiteId: string;
  activeOrgId: string;
  sites: SiteOption[];
  org: AdminOrgOverview;
  role: AdminRoleInfo;
  currentOrgIsMasterOrg: boolean;
  capabilities: string[];
  permissions: string[];
  ui: OrgUi;
  uiKey: OrgUiKey;
  logoUrl: string | null;
  loadedAt: number;
  generation: number;
};

export type AdminContextState =
  | { status: "loading" | "unauthenticated"; snapshot: null }
  | { status: "error"; snapshot: null; message: string }
  | {
      status: "no-active-site";
      snapshot: null;
      userId: string;
      sites: SiteOption[];
      warning?: string | null;
    }
  | { status: "switching"; snapshot: null; userId: string; sites: SiteOption[] }
  | {
      status: "ready";
      snapshot: AdminSnapshot;
      refreshing: boolean;
      warning: string | null;
    };

type AdminContextValue = {
  state: AdminContextState;
  retry: () => Promise<void>;
  refreshAccess: () => Promise<void>;
  switchSite: (siteId: string) => Promise<void>;
  savingSiteId: string | null;
};

const AdminContext = React.createContext<AdminContextValue | null>(null);

function safeMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.requestId) {
    return `${fallback} Reference: ${error.requestId}`;
  }
  return fallback;
}

function scopeRoles(
  roles: UserRolesResponse,
  orgId: string,
  siteId: string,
): UserRolesResponse {
  return {
    ...roles,
    orgRoles: roles.orgRoles.filter((item) => item.orgId === orgId),
    siteRoles: roles.siteRoles.filter((item) => item.tenantId === siteId),
    orgMemberships: roles.orgMemberships.filter((item) => item.orgId === orgId),
    siteMemberships: roles.siteMemberships.filter(
      (item) => item.orgId === orgId && item.tenantId === siteId,
    ),
  };
}

async function loadScopedContext(
  userId: string,
  siteState: ActiveSiteState,
  generation: number,
): Promise<AdminSnapshot> {
  const activeSite = siteState.sites.find(
    (site) => site.id === siteState.activeSiteId,
  );
  if (!activeSite?.orgId || !activeSite.id) {
    throw new Error("The active site is unavailable.");
  }

  // Keep bootstrap to two simultaneous requests while the API still uses
  // request-scoped database transactions.
  const [roles, capabilities] = await Promise.all([
    fetchUserRoles(),
    fetchOrgCapabilities(),
  ]);
  const [permissions, org] = await Promise.all([
    fetchMyPermissions(),
    fetchOrgOverview(),
  ]);
  if (roles.userId !== userId || org.id !== activeSite.orgId) {
    throw new Error("The account and active organisation do not match.");
  }
  const scopedRoles = scopeRoles(roles, activeSite.orgId, activeSite.id);
  return {
    userId,
    isSuperUser: roles.superUser === true,
    activeSiteId: activeSite.id,
    activeOrgId: activeSite.orgId,
    sites: siteState.sites,
    org,
    role: getAdminRoleInfoFromApiResponse(scopedRoles),
    currentOrgIsMasterOrg: roles.currentOrgIsMasterOrg ?? false,
    capabilities,
    permissions,
    ui: resolveOrgUi(org.vertical, org.sector),
    uiKey: resolveOrgUiKey(org.vertical, org.sector),
    logoUrl: org.logoUrl ?? null,
    loadedAt: Date.now(),
    generation,
  };
}

export function AdminContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = useSession();
  return (
    <AdminContextRuntime session={session}>{children}</AdminContextRuntime>
  );
}

/** The stateful boundary is also usable with a supplied session in runtime tests. */
export function AdminContextRuntime({
  children,
  session: sessionValue,
}: {
  children: React.ReactNode;
  session: SessionContextValue;
}) {
  const { data: session, status: sessionStatus, update } = sessionValue;
  const [state, setState] = React.useState<AdminContextState>({
    status: "loading",
    snapshot: null,
  });
  const [savingSiteId, setSavingSiteId] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const pendingBootstrap = React.useRef<{
    userId: string;
    promise: Promise<AdminContextState>;
  } | null>(null);
  const switching = React.useRef(false);
  const currentUserId = session?.user.id ?? null;

  const bootstrap = React.useCallback(
    async (userId: string): Promise<AdminContextState> => {
      const existing = pendingBootstrap.current;
      if (existing?.userId === userId) return existing.promise;
      const snapshotGeneration = generation.current;
      const promise = (async (): Promise<AdminContextState> => {
        const siteState = await fetchActiveSiteState();
        if (!siteState.activeSiteId) {
          return {
            status: "no-active-site",
            snapshot: null,
            userId,
            sites: siteState.sites,
          };
        }
        const snapshot = await loadScopedContext(
          userId,
          siteState,
          snapshotGeneration,
        );
        return { status: "ready", snapshot, refreshing: false, warning: null };
      })();
      pendingBootstrap.current = { userId, promise };
      void promise
        .finally(() => {
          if (pendingBootstrap.current?.promise === promise)
            pendingBootstrap.current = null;
        })
        .catch(() => undefined);
      return promise;
    },
    [],
  );

  React.useEffect(() => {
    const requestGeneration = ++generation.current;
    if (sessionStatus === "unauthenticated") {
      setState({ status: "unauthenticated", snapshot: null });
      return;
    }
    if (sessionStatus === "error") {
      setState({
        status: "error",
        snapshot: null,
        message: "Unable to verify your account. Please retry.",
      });
      return;
    }
    if (sessionStatus !== "authenticated" || !currentUserId) {
      setState({ status: "loading", snapshot: null });
      return;
    }
    setState({ status: "loading", snapshot: null });
    void bootstrap(currentUserId)
      .then((result) => {
        if (requestGeneration === generation.current) setState(result);
      })
      .catch((error: unknown) => {
        if (requestGeneration === generation.current) {
          setState({
            status: "error",
            snapshot: null,
            message: safeMessage(error, "Unable to load your admin context."),
          });
        }
      });
    return () => {
      generation.current += 1;
    };
  }, [sessionStatus, currentUserId, bootstrap]);

  const retry = React.useCallback(async () => {
    if (sessionStatus === "error") {
      await update();
      return;
    }
    if (!currentUserId) return;
    const requestGeneration = ++generation.current;
    setState({ status: "loading", snapshot: null });
    try {
      const result = await bootstrap(currentUserId);
      if (requestGeneration === generation.current) setState(result);
    } catch (error) {
      if (requestGeneration === generation.current) {
        setState({
          status: "error",
          snapshot: null,
          message: safeMessage(error, "Unable to load your admin context."),
        });
      }
    }
  }, [sessionStatus, currentUserId, update, bootstrap]);

  const refreshAccess = React.useCallback(async () => {
    if (state.status !== "ready" || state.refreshing) return;
    const previous = state.snapshot;
    const requestGeneration = ++generation.current;
    setState({ ...state, refreshing: true, warning: null });
    let contextChanged = false;
    try {
      const siteState = await fetchActiveSiteState();
      if (
        !siteState.activeSiteId ||
        !siteState.sites.some((site) => site.id === siteState.activeSiteId)
      ) {
        if (requestGeneration === generation.current) {
          cancelApiReads();
          setState({
            status: "no-active-site",
            snapshot: null,
            userId: previous.userId,
            sites: siteState.sites,
          });
        }
        return;
      }
      const activeSite = siteState.sites.find(
        (site) => site.id === siteState.activeSiteId,
      );
      contextChanged =
        siteState.activeSiteId !== previous.activeSiteId ||
        activeSite?.orgId !== previous.activeOrgId;
      if (contextChanged && requestGeneration === generation.current) {
        cancelApiReads();
        setState({
          status: "switching",
          snapshot: null,
          userId: previous.userId,
          sites: siteState.sites,
        });
      }
      const snapshot = await loadScopedContext(
        previous.userId,
        siteState,
        requestGeneration,
      );
      if (requestGeneration === generation.current) {
        setState({
          status: "ready",
          snapshot,
          refreshing: false,
          warning: null,
        });
      }
    } catch (error) {
      if (requestGeneration !== generation.current) return;
      if (contextChanged) {
        setState({
          status: "error",
          snapshot: null,
          message: safeMessage(
            error,
            "The active site changed, but its access could not be loaded.",
          ),
        });
        return;
      }
      if (
        error instanceof ApiError &&
        (error.status === 401 || error.status === 403)
      ) {
        setState({
          status: "error",
          snapshot: null,
          message: "Your access changed. Please retry.",
        });
      } else {
        setState({
          status: "ready",
          snapshot: previous,
          refreshing: false,
          warning: safeMessage(
            error,
            "Unable to refresh access. Your current view may be outdated.",
          ),
        });
      }
    }
  }, [state]);

  React.useEffect(() => {
    const onVisible = () => {
      if (
        document.visibilityState === "visible" &&
        state.status === "ready" &&
        Date.now() - state.snapshot.loadedAt > FRESHNESS_MS
      ) {
        void refreshAccess();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = subscribeToAccessChanges(() => void refreshAccess());
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [state, refreshAccess]);

  const switchSite = React.useCallback(
    async (siteId: string) => {
      if (switching.current || !siteId) return;
      const previous = state.status === "ready" ? state.snapshot : null;
      const sites =
        previous?.sites ??
        (state.status === "no-active-site" ? state.sites : []);
      const userId =
        previous?.userId ??
        (state.status === "no-active-site" ? state.userId : null);
      if (
        !userId ||
        !sites.some((site) => site.id === siteId) ||
        (previous && previous.activeSiteId === siteId)
      )
        return;
      switching.current = true;
      const requestGeneration = ++generation.current;
      cancelApiReads();
      setSavingSiteId(siteId);
      setState({ status: "switching", snapshot: null, userId, sites });
      let serverConfirmed = false;
      try {
        const siteState = await setActiveSite(siteId);
        if (siteState.activeSiteId !== siteId)
          throw new Error("Site switch was not confirmed.");
        serverConfirmed = true;
        const snapshot = await loadScopedContext(
          userId,
          siteState,
          requestGeneration,
        );
        if (requestGeneration === generation.current) {
          setState({
            status: "ready",
            snapshot,
            refreshing: false,
            warning: null,
          });
        }
      } catch (error) {
        if (requestGeneration === generation.current) {
          if (serverConfirmed) {
            setState({
              status: "error",
              snapshot: null,
              message: safeMessage(
                error,
                "The site changed, but its access could not be loaded. Please retry.",
              ),
            });
          } else if (previous) {
            setState({
              status: "ready",
              snapshot: previous,
              refreshing: false,
              warning: safeMessage(error, "Unable to switch sites."),
            });
          } else {
            setState({
              status: "no-active-site",
              snapshot: null,
              userId,
              sites,
              warning: safeMessage(error, "Unable to switch sites."),
            });
          }
        }
      } finally {
        switching.current = false;
        setSavingSiteId(null);
      }
    },
    [state],
  );

  const value = React.useMemo<AdminContextValue>(
    () => ({ state, retry, refreshAccess, switchSite, savingSiteId }),
    [state, retry, refreshAccess, switchSite, savingSiteId],
  );
  return (
    <AdminContext.Provider value={value}>{children}</AdminContext.Provider>
  );
}

export function useAdminContext(): AdminContextValue {
  const context = React.useContext(AdminContext);
  if (!context) throw new Error("Admin context is unavailable.");
  return context;
}
