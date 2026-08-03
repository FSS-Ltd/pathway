import { apiClient } from "./http";

export type Child = {
  id: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  yearGroup: string | null;
};

export type CreateChildInput = {
  firstName: string;
  dateOfBirth?: string;
  yearGroup?: string;
};

// Mirrors updateChildSchema's editable fields (apps/api/src/children/dto/update-child.dto.ts).
// dateOfBirth/yearGroup are not in that schema, so they cannot be edited here.
export type UpdateChildInput = {
  firstName?: string;
  preferredName?: string | null;
};

export function listChildren() {
  return apiClient.request<Child[]>("/children", { method: "GET" });
}

export function getChild(id: string) {
  return apiClient.request<Child>(`/children/${id}`, { method: "GET" });
}

export function createChild(input: CreateChildInput) {
  return apiClient.request<Child>("/children", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateChild(id: string, input: UpdateChildInput) {
  return apiClient.request<Child>(`/children/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
