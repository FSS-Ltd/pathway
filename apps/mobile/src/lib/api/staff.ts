import { apiClient } from "@/lib/api/client";

export type StaffProfile = {
  id: string;
  firstName: string | null;
  fullName: string;
  displayName: string | null;
  hasAvatar: boolean;
};

export async function fetchCurrentStaffProfile(): Promise<StaffProfile> {
  return apiClient.request<StaffProfile>("/staff/profile", {
    method: "GET",
  });
}

