import { apiClient } from "./http";

export type PlatformCapabilities = { capabilities: string[] };

export type PlatformModule = {
  module: string;
  status: string;
  activatedAt: string | null;
  expiresAt: string | null;
  billingSource: string | null;
};

export function getCapabilities(token?: string) {
  return apiClient.request<PlatformCapabilities>("/platform/capabilities", {
    method: "GET",
    token,
  });
}

export function getModules(token?: string) {
  return apiClient.request<PlatformModule[]>("/platform/modules", { method: "GET", token });
}
