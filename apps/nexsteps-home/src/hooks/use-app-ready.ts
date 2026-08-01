import { useContext } from "react";

import { AppBootstrapContext } from "@/providers/app-providers";

export function useAppReady() {
  const context = useContext(AppBootstrapContext);
  if (!context) {
    throw new Error("useAppReady must be used within AppProviders");
  }
  return context;
}
