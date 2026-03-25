import type { PropsWithChildren } from "react";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import type { AppSpace } from "@pathway/mobile-core";

import { assertEnv } from "@/config/env";
import { apiClient } from "@/lib/api/client";
import {
  bootstrapAuthState,
  type BootstrapState,
} from "@/lib/auth/bootstrap";
import { loginWithAuth0UniversalLogin, logoutFromAuth0 } from "@/lib/auth/auth0-client";
import { updateSessionSnapshot } from "@/lib/auth/session-store";

type AppBootstrapContextValue = {
  bootstrapState: BootstrapState;
  refreshBootstrap: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  switchSpace: (space: AppSpace) => Promise<void>;
  switchActiveSite: (siteId: string) => Promise<void>;
};

export const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(
  null,
);

export function AppProviders({ children }: PropsWithChildren) {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({
    status: "loading",
  });

  const refreshBootstrap = useCallback(async () => {
    setBootstrapState({ status: "loading" });
    const nextState = await bootstrapAuthState();
    setBootstrapState(nextState);
  }, []);

  const signOut = useCallback(async () => {
    await logoutFromAuth0();
    setBootstrapState({ status: "unauthenticated", route: "/(auth)/sign-in" });
  }, []);

  const switchSpace = useCallback(
    async (space: AppSpace) => {
      if (bootstrapState.status !== "ready") return;
      if (!bootstrapState.availableSpaces.includes(space)) return;

      await updateSessionSnapshot({ preferredSpace: space });
      await refreshBootstrap();
    },
    [bootstrapState, refreshBootstrap],
  );

  const switchActiveSite = useCallback(
    async (siteId: string) => {
      const token =
        bootstrapState.status === "ready" || bootstrapState.status === "needs-site-selection"
          ? bootstrapState.session.accessToken
          : null;
      if (!token) return;

      await apiClient.setActiveSite(siteId, token);
      await updateSessionSnapshot({ activeSiteId: siteId });
      await refreshBootstrap();
    },
    [bootstrapState, refreshBootstrap],
  );

  const signIn = useCallback(async () => {
    await loginWithAuth0UniversalLogin();
    await refreshBootstrap();
  }, [refreshBootstrap]);

  useEffect(() => {
    try {
      assertEnv();
      void refreshBootstrap();
    } catch (error) {
      setBootstrapState({
        status: "error",
        route: "/(auth)/sign-in",
        message:
          error instanceof Error ? error.message : "Mobile environment configuration is invalid.",
      });
    }
  }, [refreshBootstrap]);

  const value = useMemo(
    () => ({
      bootstrapState,
      refreshBootstrap,
      signIn,
      signOut,
      switchSpace,
      switchActiveSite,
    }),
    [bootstrapState, refreshBootstrap, signIn, signOut, switchSpace, switchActiveSite],
  );

  return (
    <AppBootstrapContext.Provider value={value}>
      {children}
    </AppBootstrapContext.Provider>
  );
}
