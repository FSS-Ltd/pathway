import type { ActiveSiteState, AppSpace, RolesResponse } from "@pathway/mobile-core";

import { apiClient, ApiError } from "@/lib/api/client";
import {
  clearAppStateSnapshot,
  getAppStateSnapshot,
  updateAppStateSnapshot,
  type AppStateSnapshot,
} from "@/lib/auth/session-store";
import { resolveSpaceFromRoles } from "@/lib/auth/space-resolver";

export type BootstrapRoute =
  | "/(auth)/sign-in"
  | "/(auth)/site-select"
  | "/(auth)/register-child"
  | "/(serve)/(tabs)/attendance"
  | "/(family)/(tabs)/home";

export type BootstrapState =
  | { status: "loading" }
  | { status: "unauthenticated"; route: "/(auth)/sign-in" }
  | {
      status: "needs-site-selection";
      route: "/(auth)/site-select";
      state: AppStateSnapshot;
      activeSiteState: ActiveSiteState;
    }
  | {
      status: "ready";
      route: "/(auth)/site-select";
      state: AppStateSnapshot;
      roles: RolesResponse;
      activeSiteState: ActiveSiteState;
      space: AppSpace;
      availableSpaces: AppSpace[];
      isDualSpaceUser: boolean;
      hasFamilyAccess: boolean;
      hasServeAccess: boolean;
    }
  | {
      status: "error";
      route: "/(auth)/sign-in";
      message: string;
    };

async function resolveActiveSite(
  token: string,
  state: AppStateSnapshot,
): Promise<ActiveSiteState> {
  const siteState = await apiClient.getActiveSiteState(token);

  if (!siteState.activeSiteId && siteState.sites.length === 1) {
    const siteId = siteState.sites[0]?.id;
    if (siteId) {
      const updated = await apiClient.setActiveSite(siteId, token);
      await updateAppStateSnapshot({ activeSiteId: siteId });
      return updated;
    }
  }

  if (state.activeSiteId && state.activeSiteId !== siteState.activeSiteId) {
    const canUseStoredSite = siteState.sites.some((site) => site.id === state.activeSiteId);
    if (canUseStoredSite) {
      const updated = await apiClient.setActiveSite(state.activeSiteId, token);
      await updateAppStateSnapshot({ activeSiteId: state.activeSiteId });
      return updated;
    }
  }

  return siteState;
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
    return { status: "unauthenticated", route: "/(auth)/sign-in" };
  }

  apiClient.setAccessToken(token);
  const state = (await getAppStateSnapshot()) ?? { updatedAt: new Date().toISOString() };

  try {
    const me = await apiClient.getAuthMe(token);
    const activeSiteState = await resolveActiveSite(token, state);

    if (!activeSiteState.activeSiteId && activeSiteState.sites.length > 1) {
      return {
        status: "needs-site-selection",
        route: "/(auth)/site-select",
        state,
        activeSiteState,
      };
    }

    const roles = await apiClient.getRoles(token);
    const spaceResolution = resolveSpaceFromRoles(roles, state.preferredSpace);
    const nextSpace = spaceResolution.primarySpace;

    const updatedState = await updateAppStateSnapshot({
      userId: me.userId,
      activeSiteId: activeSiteState.activeSiteId ?? state.activeSiteId,
      preferredSpace: nextSpace,
    });

    return {
      status: "ready",
      route: "/(auth)/site-select",
      state: updatedState,
      roles,
      activeSiteState,
      space: nextSpace,
      availableSpaces: spaceResolution.availableSpaces,
      isDualSpaceUser: spaceResolution.isDualSpaceUser,
      hasFamilyAccess: spaceResolution.hasFamilyAccess,
      hasServeAccess: spaceResolution.hasServeAccess,
    };
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      await clearAppStateSnapshot();
      apiClient.setAccessToken(null);
      if (__DEV__) {
        const bodySnippet = error.body?.trim()
          ? ` — ${error.body.trim().slice(0, 180)}`
          : "";
        return {
          status: "error",
          route: "/(auth)/sign-in",
          message: `Bootstrap auth failed (${error.status}) on ${error.message}${bodySnippet}`,
        };
      }
      return { status: "unauthenticated", route: "/(auth)/sign-in" };
    }

    return {
      status: "error",
      route: "/(auth)/sign-in",
      message: error instanceof Error ? error.message : "Unable to bootstrap mobile session",
    };
  }
}

