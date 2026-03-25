import { apiClient } from "@/lib/api/client";

export type SessionGroup = {
  id: string;
  name: string;
};

export type SessionDetail = {
  id: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  tenantId: string;
  groups: SessionGroup[];
  attendanceMarked?: number;
  attendanceTotal?: number;
  lessons?: Array<{
    id: string;
    title?: string;
    description?: string | null;
    resourceFileName?: string | null;
    fileKey?: string | null;
  }>;
};

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetail> {
  return apiClient.request<SessionDetail>(`/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
  });
}

