import type { ActiveSiteState } from "@pathway/mobile-core";

import { apiClient, ApiError, authApi, householdSetupApi } from "@/lib/api";
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
      session: SessionSnapshot;
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
  accessToken: string,
): Promise<"/(setup)/children-list" | "/(home)/(tabs)/week"> {
  try {
    const status = await householdSetupApi.getStatus(accessToken);
    return status.setupCompletedAt ? "/(home)/(tabs)/week" : "/(setup)/children-list";
  } catch {
    return "/(home)/(tabs)/week";
  }
}

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

    const route = await resolveSetupRoute(updatedSession.accessToken);

    return {
      status: "ready",
      route,
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
