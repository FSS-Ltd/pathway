import type { ActiveSiteState, AuthMe } from "@pathway/mobile-core";

import { apiClient } from "./http";

export function getAuthMe(token?: string) {
  return apiClient.request<AuthMe>("/auth/me", { method: "GET", token });
}

export function getActiveSiteState(token?: string) {
  return apiClient.request<ActiveSiteState>("/auth/active-site", { method: "GET", token });
}

export function setActiveSite(siteId: string, token?: string) {
  return apiClient.request<ActiveSiteState>("/auth/active-site", {
    method: "POST",
    token,
    body: JSON.stringify({ siteId }),
  });
}
