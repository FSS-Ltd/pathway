import type { PropsWithChildren } from "react";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { assertEnv } from "@/config/env";
import { apiClient } from "@/lib/api";
import { bootstrapAuthState, type BootstrapState } from "@/lib/auth/bootstrap";
import {
  loginWithAuth0UniversalLogin,
  loginWithPassword,
  logoutFromAuth0,
} from "@/lib/auth/auth0-client";

type AppBootstrapContextValue = {
  bootstrapState: BootstrapState;
  refreshBootstrap: () => Promise<BootstrapState>;
  signIn: () => Promise<BootstrapState>;
  signInWithPassword: (username: string, password: string) => Promise<BootstrapState>;
  signOut: () => Promise<void>;
};

export const AppBootstrapContext = createContext<AppBootstrapContextValue | null>(null);

/**
 * networkMode defaults to "online", which pauses queries/mutations based on
 * browser online/offline events - meaningless in React Native, and (found
 * while verifying Plan 05's error states) leaves fetchStatus stuck
 * "paused" forever with isError/isLoading both false, silently rendering
 * as an empty state instead of a real error. "always" makes every screen's
 * loading/error/empty distinction (design-system.md's mandated states)
 * reflect the actual fetch outcome. No NetInfo integration exists to make
 * "online" mode accurate instead.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: { networkMode: "always" },
    mutations: { networkMode: "always" },
  },
});

export function AppProviders({ children }: PropsWithChildren) {
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ status: "loading" });

  const refreshBootstrap = useCallback(async () => {
    setBootstrapState({ status: "loading" });
    const nextState = await bootstrapAuthState();
    setBootstrapState(nextState);
    return nextState;
  }, []);

  const signOut = useCallback(async () => {
    await logoutFromAuth0();
    apiClient.setAccessToken(null);
    const nextState: BootstrapState = { status: "unauthenticated", route: "/(setup)/welcome" };
    setBootstrapState(nextState);
  }, []);

  const signIn = useCallback(async () => {
    await loginWithAuth0UniversalLogin();
    return refreshBootstrap();
  }, [refreshBootstrap]);

  const signInWithPassword = useCallback(
    async (username: string, password: string) => {
      await loginWithPassword(username, password);
      return refreshBootstrap();
    },
    [refreshBootstrap],
  );

  useEffect(() => {
    try {
      assertEnv();
      void refreshBootstrap();
    } catch (error) {
      setBootstrapState({
        status: "error",
        route: "/(setup)/welcome",
        message:
          error instanceof Error ? error.message : "NexSteps Home environment configuration is invalid.",
      });
    }
  }, [refreshBootstrap]);

  const value = useMemo(
    () => ({ bootstrapState, refreshBootstrap, signIn, signInWithPassword, signOut }),
    [bootstrapState, refreshBootstrap, signIn, signInWithPassword, signOut],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppBootstrapContext.Provider value={value}>{children}</AppBootstrapContext.Provider>
    </QueryClientProvider>
  );
}
