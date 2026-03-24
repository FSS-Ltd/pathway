import type { PropsWithChildren } from "react";
import { createContext, useCallback, useEffect, useMemo, useState } from "react";

import { assertEnv } from "@/config/env";
import {
  bootstrapAuthState,
  type BootstrapState,
} from "@/lib/auth/bootstrap";
import { loginWithAuth0UniversalLogin, logoutFromAuth0 } from "@/lib/auth/auth0-client";

type AppBootstrapContextValue = {
  bootstrapState: BootstrapState;
  refreshBootstrap: () => Promise<void>;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
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
    }),
    [bootstrapState, refreshBootstrap, signIn, signOut],
  );

  return (
    <AppBootstrapContext.Provider value={value}>
      {children}
    </AppBootstrapContext.Provider>
  );
}
