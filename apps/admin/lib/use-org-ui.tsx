"use client";

import { useAdminContext } from "./admin-context";
import { resolveOrgUi, orgLabel, type OrgUi, type OrgUiKey } from "./org-ui";

type OrgUiContextValue = {
  ui: OrgUi;
  key: OrgUiKey;
  logoUrl: string | null;
  isLoading: boolean;
};

/** Compatibility selector over the shared admin context. */
export function useOrgUi(): OrgUiContextValue {
  const { state } = useAdminContext();
  if (state.status !== "ready") {
    return {
      ui: resolveOrgUi(null, null),
      key: "UNKNOWN",
      logoUrl: null,
      isLoading: state.status === "loading" || state.status === "switching",
    };
  }
  return {
    ui: state.snapshot.ui,
    key: state.snapshot.uiKey,
    logoUrl: state.snapshot.logoUrl,
    isLoading: false,
  };
}

export function useOrgLabel(href: string, fallback: string): string {
  const { ui } = useOrgUi();
  return orgLabel(ui, href, fallback);
}
