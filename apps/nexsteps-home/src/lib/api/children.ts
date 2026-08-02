import { apiClient } from "./http";

export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
};

export type CreateChildInput = {
  firstName: string;
  dateOfBirth?: string;
  yearGroup?: string;
};

export function listChildren() {
  return apiClient.request<Child[]>("/children", { method: "GET" });
}

export function createChild(input: CreateChildInput) {
  return apiClient.request<Child>("/children", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
