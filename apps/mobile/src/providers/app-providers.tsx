import type { PropsWithChildren } from "react";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { AppSpace } from "@pathway/mobile-core";
import { useAuth } from "@clerk/clerk-expo";

import { assertEnv } from "@/config/env";
import { apiClient } from "@/lib/api/client";
import { bootstrapAuthState, startTokenRefresh, type BootstrapState } from "@/lib/auth/bootstrap";
import { updateAppStateSnapshot } from "@/lib/auth/session-store";

type AppBootstrapContextValue = {
  bootstrapState: BootstrapState;
  refreshBootstrap: () => Promise<void>;
  signOut: () => Promise<void>;
  switchSpace: (space: AppSpace) => Promise<void>;
  switchActiveSite: (siteId: string) => Promise<void>;
};

export const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(
  null,
);

/**
 * There's no signIn() here anymore - Clerk's sign-in is a hook-driven flow
 * (useSignIn() in app/(auth)/sign-in.tsx), not an imperative call a provider
 * can kick off. Once that screen completes sign-in and calls setActive(),
 * Clerk's isSignedIn flips true and the effect below reacts to it.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useAuth();
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({
    status: "loading",
  });

  const refreshBootstrap = useCallback(async () => {
    setBootstrapState({ status: "loading" });
    const nextState = await bootstrapAuthState(getToken);
    setBootstrapState(nextState);
  }, [getToken]);

  const signOut = useCallback(async () => {
    await clerkSignOut();
    setBootstrapState({ status: "unauthenticated", route: "/(auth)/sign-in" });
  }, [clerkSignOut]);

  const switchSpace = useCallback(
    async (space: AppSpace) => {
      if (bootstrapState.status !== "ready") return;
      if (!bootstrapState.availableSpaces.includes(space)) return;

      await updateAppStateSnapshot({ preferredSpace: space });
      await refreshBootstrap();
    },
    [bootstrapState, refreshBootstrap],
  );

  const switchActiveSite = useCallback(
    async (siteId: string) => {
      const token = await getToken();
      if (!token) return;

      await apiClient.setActiveSite(siteId, token);
      await updateAppStateSnapshot({ activeSiteId: siteId });
      await refreshBootstrap();
    },
    [getToken, refreshBootstrap],
  );

  useEffect(() => {
    if (!isLoaded) return;

    try {
      assertEnv();
    } catch (error) {
      setBootstrapState({
        status: "error",
        route: "/(auth)/sign-in",
        message:
          error instanceof Error ? error.message : "Mobile environment configuration is invalid.",
      });
      return;
    }

    if (!isSignedIn) {
      setBootstrapState({ status: "unauthenticated", route: "/(auth)/sign-in" });
      return;
    }

    void refreshBootstrap();
  }, [isLoaded, isSignedIn, refreshBootstrap]);

  useEffect(() => {
    if (!isSignedIn) return;
    return startTokenRefresh(getToken);
  }, [isSignedIn, getToken]);

  const value = useMemo(
    () => ({
      bootstrapState,
      refreshBootstrap,
      signOut,
      switchSpace,
      switchActiveSite,
    }),
    [bootstrapState, refreshBootstrap, signOut, switchSpace, switchActiveSite],
  );

  return (
    <AppBootstrapContext.Provider value={value}>
      {children}
    </AppBootstrapContext.Provider>
  );
}
