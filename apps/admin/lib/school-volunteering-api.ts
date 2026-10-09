import {
  API_BASE_URL,
  apiFetch,
  buildAuthHeaders,
  isUsingMockApi,
} from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export interface VolunteerDay {
  date: string;
  status: "Available" | "Full" | "Selected";
  spacesLeft: number;
}

export interface ParentVolunteeringCalendar {
  siteId: string;
  capacity: number;
  periods: Array<{
    id: string;
    name: string;
    startsOn: string;
    endsOn: string;
    days: VolunteerDay[];
  }>;
}

export interface StaffVolunteeringRota {
  siteId: string;
  capacity: number;
  canManage: boolean;
  days: Array<{
    date: string;
    volunteers: Array<{ id: string; name: string }>;
  }>;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (isUsingMockApi()) {
    throw new Error("School volunteering is unavailable in mock mode.");
  }
  const response = await apiFetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "School volunteering could not be updated.",
    );
  }
  return response.json() as Promise<T>;
}

const parentPath = (siteId: string) =>
  `/ace/parent/sites/${encodeURIComponent(siteId)}/volunteering`;
const staffPath = (siteId: string) =>
  `/ace/staff/sites/${encodeURIComponent(siteId)}/volunteering`;

export function fetchParentVolunteering(
  siteId: string,
  signal?: AbortSignal,
): Promise<ParentVolunteeringCalendar> {
  return request(parentPath(siteId), { signal });
}

export function saveParentVolunteering(
  siteId: string,
  periodId: string,
  dates: string[],
): Promise<{ added: number; removed: number }> {
  return request(
    `${parentPath(siteId)}/periods/${encodeURIComponent(periodId)}`,
    {
      method: "PUT",
      body: JSON.stringify({ dates }),
    },
  );
}

export function fetchStaffVolunteering(
  siteId: string,
  from: string,
  to: string,
  signal?: AbortSignal,
): Promise<StaffVolunteeringRota> {
  const query = new URLSearchParams({ from, to });
  return request(`${staffPath(siteId)}?${query}`, { signal });
}

export function cancelStaffVolunteer(
  siteId: string,
  reservationId: string,
  reason: string,
): Promise<{ cancelled: true }> {
  return request(
    `${staffPath(siteId)}/${encodeURIComponent(reservationId)}/cancellation`,
    {
      method: "PUT",
      body: JSON.stringify({ reason }),
    },
  );
}
