import { apiClient } from "./http";

export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

export function listChildren() {
  return apiClient.request<Child[]>("/children", { method: "GET" });
}
