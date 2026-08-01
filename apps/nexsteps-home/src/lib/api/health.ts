import { apiClient } from "./http";

export type HealthResponse = {
  status: string;
  dbTime?: string | null;
};

export function getHealth() {
  return apiClient.request<HealthResponse>("/health", { method: "GET" });
}
