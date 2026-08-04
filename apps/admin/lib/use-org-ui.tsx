"use client";

import React from "react";
import { useSession } from "@/lib/use-session-compat";
import { fetchOrgOverview } from "./api-client";
import { subscribeToActiveSiteChanges } from "./active-site-events";
import { resolveOrgUi, resolveOrgUiKey, orgLabel, type OrgUi, type OrgUiKey } from "./org-ui";

type OrgUiContextValue = {
  ui: OrgUi;
  key: OrgUiKey;
  logoUrl: string | null;
  isLoading: boolean;
};

const OrgUiContext = React.createContext<OrgUiContextValue>({
  ui: resolveOrgUi(null, null),
  key: "UNKNOWN",
  logoUrl: null,
  isLoading: false,
});

export function OrgUiProvider({ children }: { children: React.ReactNode }) {
  const { data: session } = useSession();
  const [state, setState] = React.useState<OrgUiContextValue>({
    ui: resolveOrgUi(null, null),
    key: "UNKNOWN",
    logoUrl: null,
    isLoading: false,
  });

  React.useEffect(() => {
    if (!session) {
      setState({ ui: resolveOrgUi(null, null), key: "UNKNOWN", logoUrl: null, isLoading: false });
      return;
    }

    let cancelled = false;
    const load = () => {
      setState((prev) => ({ ...prev, isLoading: true }));
      fetchOrgOverview()
        .then((org) => {
          if (cancelled) return;
          setState({
            ui: resolveOrgUi(org.vertical, org.sector),
            key: resolveOrgUiKey(org.vertical, org.sector),
            logoUrl: org.logoUrl ?? null,
            isLoading: false,
          });
        })
        .catch(() => {
          if (cancelled) return;
          setState({ ui: resolveOrgUi(null, null), key: "UNKNOWN", logoUrl: null, isLoading: false });
        });
    };

    load();
    const unsubscribe = subscribeToActiveSiteChanges(load);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [session]);

  return <OrgUiContext.Provider value={state}>{children}</OrgUiContext.Provider>;
}

export function useOrgUi(): OrgUiContextValue {
  return React.useContext(OrgUiContext);
}

export function useOrgLabel(href: string, fallback: string): string {
  const { ui } = useOrgUi();
  return orgLabel(ui, href, fallback);
}
