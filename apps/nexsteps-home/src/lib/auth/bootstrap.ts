import type { ActiveSiteState } from "@pathway/mobile-core";

import { apiClient, ApiError, authApi, householdSetupApi } from "@/lib/api";
import {
  clearAppStateSnapshot,
  getAppStateSnapshot,
  updateAppStateSnapshot,
  type AppStateSnapshot,
} from "@/lib/auth/session-store";

/**
 * Unlike apps/mobile/src/lib/auth/bootstrap.ts, there is no dual-space
 * (family/serve) resolution here - NexSteps Home is a single-purpose
 * "home" space. There is also no site-selection screen in the 76-screen
 * approved inventory: a household with more than one site is an edge case
 * the product contract does not yet cover. resolveActiveSite still
 * auto-selects when there is exactly one site (the expected common case);
 * if a household genuinely has more than one and none stored, activeSiteId
 * stays null rather than fabricating a picker screen that isn't approved.
 */
export type BootstrapRoute =
  | "/(setup)/welcome"
  | "/(setup)/children-list"
  | "/(home)/(tabs)/week";

export type BootstrapState =
  | { status: "loading" }
  | { status: "unauthenticated"; route: "/(setup)/welcome" }
  | {
      status: "ready";
      route: "/(setup)/children-list" | "/(home)/(tabs)/week";
      state: AppStateSnapshot;
      activeSiteState: ActiveSiteState;
    }
  | {
      status: "error";
      route: "/(setup)/welcome";
      message: string;
    };

/**
 * A signed-in household that hasn't finished the guided setup flow (H2/Plan
 * 05) lands back on children-list, the first per-household step, rather
 * than the Week tab. Best-effort: if the check itself fails (network,
 * non-household org), fail open to Week rather than blocking bootstrap on a
 * secondary call.
 */
async function resolveSetupRoute(
  token: string,
): Promise<"/(setup)/children-list" | "/(home)/(tabs)/week"> {
  try {
    const status = await householdSetupApi.getStatus(token);
    return status.setupCompletedAt ? "/(home)/(tabs)/week" : "/(setup)/children-list";
  } catch {
    return "/(home)/(tabs)/week";
  }
}

async function resolveActiveSite(
  token: string,
  state: AppStateSnapshot,
): Promise<ActiveSiteState> {
  const siteState = await authApi.getActiveSiteState(token);

  if (!siteState.activeSiteId && siteState.sites.length === 1) {
    const siteId = siteState.sites[0]?.id;
    if (siteId) {
      const updated = await authApi.setActiveSite(siteId, token);
      await updateAppStateSnapshot({ activeSiteId: siteId });
      return updated;
    }
  }

  if (state.activeSiteId && state.activeSiteId !== siteState.activeSiteId) {
    const canUseStoredSite = siteState.sites.some((site) => site.id === state.activeSiteId);
    if (canUseStoredSite) {
      const updated = await authApi.setActiveSite(state.activeSiteId, token);
      await updateAppStateSnapshot({ activeSiteId: state.activeSiteId });
      return updated;
    }
  }

  return siteState;
}

/**
 * Clerk session tokens are short-lived (default 60s). AppProviders only
 * calls bootstrapAuthState once per sign-in, so without this the token
 * cached in apiClient goes stale mid-session and every request after that
 * 401s with an "exp" claim failure. Call while signed in and clear the
 * returned interval on sign-out/unmount.
 */
export function startTokenRefresh(getToken: () => Promise<string | null>): () => void {
  const interval = setInterval(() => {
    void getToken().then((token) => apiClient.setAccessToken(token));
  }, 30_000);
  return () => clearInterval(interval);
}

/**
 * getToken comes from Clerk's useAuth() - unlike the old stored
 * session.accessToken, Clerk tokens are short-lived and must be fetched
 * fresh for each call rather than cached across this whole bootstrap.
 */
export async function bootstrapAuthState(
  getToken: () => Promise<string | null>,
): Promise<BootstrapState> {
  const token = await getToken();
  if (!token) {
    return { status: "unauthenticated", route: "/(setup)/welcome" };
  }

  apiClient.setAccessToken(token);
  const state = (await getAppStateSnapshot()) ?? { updatedAt: new Date().toISOString() };

  try {
    const me = await authApi.getAuthMe(token);
    const activeSiteState = await resolveActiveSite(token, state);
    const activeSite = activeSiteState.sites.find(
      (site) => site.id === activeSiteState.activeSiteId,
    );
    apiClient.setOrgId(activeSite?.orgId ?? activeSiteState.sites[0]?.orgId ?? null);

    const updatedState = await updateAppStateSnapshot({
      userId: me.userId,
      activeSiteId: activeSiteState.activeSiteId ?? state.activeSiteId,
    });

    const route = await resolveSetupRoute(token);

    return {
      status: "ready",
      route,
      state: updatedState,
      activeSiteState,
    };
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      await clearAppStateSnapshot();
      apiClient.setAccessToken(null);
      apiClient.setOrgId(null);
      return { status: "unauthenticated", route: "/(setup)/welcome" };
    }

    return {
      status: "error",
      route: "/(setup)/welcome",
      message:
        error instanceof Error ? error.message : "Unable to bootstrap NexSteps Home session",
    };
  }
}
