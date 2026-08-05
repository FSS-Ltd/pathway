import type { PropsWithChildren } from "react";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@clerk/clerk-expo";

import { assertEnv } from "@/config/env";
import { apiClient } from "@/lib/api";
import { bootstrapAuthState, type BootstrapState } from "@/lib/auth/bootstrap";

type AppBootstrapContextValue = {
  bootstrapState: BootstrapState;
  refreshBootstrap: () => Promise<BootstrapState>;
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

/**
 * There's no signIn()/signInWithPassword() here anymore - Clerk's sign-in
 * and sign-up are hook-driven flows (useSignIn()/useSignUp() in the
 * (setup) screens), not imperative calls a provider can kick off. Once a
 * screen completes sign-in and calls setActive(), Clerk's isSignedIn flips
 * true and the effect below reacts to it.
 */
export function AppProviders({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, getToken, signOut: clerkSignOut } = useAuth();
  const [bootstrapState, setBootstrapState] = useState<BootstrapState>({ status: "loading" });

  const refreshBootstrap = useCallback(async () => {
    setBootstrapState({ status: "loading" });
    const nextState = await bootstrapAuthState(getToken);
    setBootstrapState(nextState);
    return nextState;
  }, [getToken]);

  const signOut = useCallback(async () => {
    await clerkSignOut();
    apiClient.setAccessToken(null);
    setBootstrapState({ status: "unauthenticated", route: "/(setup)/welcome" });
  }, [clerkSignOut]);

  useEffect(() => {
    if (!isLoaded) return;

    try {
      assertEnv();
    } catch (error) {
      setBootstrapState({
        status: "error",
        route: "/(setup)/welcome",
        message:
          error instanceof Error ? error.message : "NexSteps Home environment configuration is invalid.",
      });
      return;
    }

    if (!isSignedIn) {
      setBootstrapState({ status: "unauthenticated", route: "/(setup)/welcome" });
      return;
    }

    void refreshBootstrap();
  }, [isLoaded, isSignedIn, refreshBootstrap]);

  const value = useMemo(
    () => ({ bootstrapState, refreshBootstrap, signOut }),
    [bootstrapState, refreshBootstrap, signOut],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppBootstrapContext.Provider value={value}>{children}</AppBootstrapContext.Provider>
    </QueryClientProvider>
  );
}
