import { useContext } from "react";

import { AppBootstrapContext } from "@/providers/app-providers";

export function useAppReady() {
  const context = useContext(AppBootstrapContext);

  if (!context) {
    throw new Error("useAppReady must be used within AppProviders");
  }

  return {
    isReady: context.bootstrapState.status !== "loading",
    bootstrapState: context.bootstrapState,
    refreshBootstrap: context.refreshBootstrap,
    signIn: context.signIn,
    signOut: context.signOut,
    switchSpace: context.switchSpace,
    switchActiveSite: context.switchActiveSite,
  };
}
