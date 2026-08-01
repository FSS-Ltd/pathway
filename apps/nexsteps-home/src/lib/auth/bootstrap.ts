import type { ActiveSiteState } from "@pathway/mobile-core";

import { apiClient, ApiError, authApi } from "@/lib/api";
import { getValidSessionSnapshot } from "@/lib/auth/auth0-client";
import {
  clearSessionSnapshot,
  updateSessionSnapshot,
  type SessionSnapshot,
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
export type BootstrapRoute = "/(setup)/welcome" | "/(home)/(tabs)/week";

export type BootstrapState =
  | { status: "loading" }
  | { status: "unauthenticated"; route: "/(setup)/welcome" }
  | {
      status: "ready";
      route: "/(home)/(tabs)/week";
      session: SessionSnapshot;
      activeSiteState: ActiveSiteState;
    }
  | {
      status: "error";
      route: "/(setup)/welcome";
      message: string;
    };

async function resolveActiveSite(session: SessionSnapshot): Promise<ActiveSiteState> {
  const state = await authApi.getActiveSiteState(session.accessToken);

  if (!state.activeSiteId && state.sites.length === 1) {
    const siteId = state.sites[0]?.id;
    if (siteId) {
      const updated = await authApi.setActiveSite(siteId, session.accessToken);
      await updateSessionSnapshot({ activeSiteId: siteId });
      return updated;
    }
  }

  if (session.activeSiteId && session.activeSiteId !== state.activeSiteId) {
    const canUseStoredSite = state.sites.some((site) => site.id === session.activeSiteId);
    if (canUseStoredSite) {
      const updated = await authApi.setActiveSite(session.activeSiteId, session.accessToken);
      await updateSessionSnapshot({ activeSiteId: session.activeSiteId });
      return updated;
    }
  }

  return state;
}

export async function bootstrapAuthState(): Promise<BootstrapState> {
  const session = await getValidSessionSnapshot();

  if (!session?.accessToken) {
    return { status: "unauthenticated", route: "/(setup)/welcome" };
  }

  apiClient.setAccessToken(session.accessToken);

  try {
    const me = await authApi.getAuthMe(session.accessToken);
    const activeSiteState = await resolveActiveSite(session);

    const updatedSession = await updateSessionSnapshot({
      userId: me.userId,
      activeSiteId: activeSiteState.activeSiteId ?? session.activeSiteId,
    });

    if (!updatedSession) {
      return { status: "unauthenticated", route: "/(setup)/welcome" };
    }

    return {
      status: "ready",
      route: "/(home)/(tabs)/week",
      session: updatedSession,
      activeSiteState,
    };
  } catch (error) {
    if (error instanceof ApiError && [401, 403].includes(error.status)) {
      await clearSessionSnapshot();
      apiClient.setAccessToken(null);
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
