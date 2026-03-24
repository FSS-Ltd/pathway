import type { ActiveSiteState, AppSpace, RolesResponse } from "@pathway/mobile-core";

import { apiClient, ApiError } from "@/lib/api/client";
import { getValidSessionSnapshot } from "@/lib/auth/auth0-client";
import {
  clearSessionSnapshot,
  updateSessionSnapshot,
  type SessionSnapshot,
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
      session: SessionSnapshot;
      activeSiteState: ActiveSiteState;
    }
  | {
      status: "ready";
      route: "/(auth)/site-select";
      session: SessionSnapshot;
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

async function resolveActiveSite(session: SessionSnapshot): Promise<ActiveSiteState> {
  const state = await apiClient.getActiveSiteState(session.accessToken);

  if (!state.activeSiteId && state.sites.length === 1) {
    const siteId = state.sites[0]?.id;
    if (siteId) {
      const updated = await apiClient.setActiveSite(siteId, session.accessToken);
      await updateSessionSnapshot({ activeSiteId: siteId });
      return updated;
    }
  }

  if (session.activeSiteId && session.activeSiteId !== state.activeSiteId) {
    const canUseStoredSite = state.sites.some((site) => site.id === session.activeSiteId);
    if (canUseStoredSite) {
      const updated = await apiClient.setActiveSite(session.activeSiteId, session.accessToken);
      await updateSessionSnapshot({ activeSiteId: session.activeSiteId });
      return updated;
    }
  }

  return state;
}

export async function bootstrapAuthState(): Promise<BootstrapState> {
  const session = await getValidSessionSnapshot();

  if (!session?.accessToken) {
    return { status: "unauthenticated", route: "/(auth)/sign-in" };
  }

  apiClient.setAccessToken(session.accessToken);

  try {
    const me = await apiClient.getAuthMe(session.accessToken);
    const activeSiteState = await resolveActiveSite(session);

    if (!activeSiteState.activeSiteId && activeSiteState.sites.length > 1) {
      return {
        status: "needs-site-selection",
        route: "/(auth)/site-select",
        session,
        activeSiteState,
      };
    }

    const roles = await apiClient.getRoles(session.accessToken);
    const spaceResolution = resolveSpaceFromRoles(roles, session.preferredSpace);
    const nextSpace = spaceResolution.primarySpace;

    if (__DEV__) {
      console.log("ROLES_PAYLOAD", JSON.stringify(roles, null, 2));
      console.log("SPACE_FLAGS", {
        hasFamilyAccess: spaceResolution.hasFamilyAccess,
        hasServeAccess: spaceResolution.hasServeAccess,
        availableSpaces: spaceResolution.availableSpaces,
        primarySpace: spaceResolution.primarySpace,
      });
    }

    const updatedSession = await updateSessionSnapshot({
      userId: me.userId,
      activeSiteId: activeSiteState.activeSiteId ?? session.activeSiteId,
      preferredSpace: nextSpace,
    });

    if (!updatedSession) {
      return { status: "unauthenticated", route: "/(auth)/sign-in" };
    }

    return {
      status: "ready",
      route: "/(auth)/site-select",
      session: updatedSession,
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
      await clearSessionSnapshot();
      apiClient.setAccessToken(null);
      return { status: "unauthenticated", route: "/(auth)/sign-in" };
    }

    return {
      status: "error",
      route: "/(auth)/sign-in",
      message: error instanceof Error ? error.message : "Unable to bootstrap mobile session",
    };
  }
}
