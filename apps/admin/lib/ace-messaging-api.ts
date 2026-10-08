import { API_BASE_URL, buildAuthHeaders, isUsingMockApi } from "./api-client";
import { apiErrorFromResponse } from "./api-transport";

export type StaffConversation = {
  id: string;
  kind: "STAFF_DIRECT" | "STAFF_ROOM";
  title: string;
  latestMessage: { preview: string; createdAt: string } | null;
  updatedAt: string;
  unreadCount: number;
};

export type StaffMessage = {
  id: string;
  sequence: number;
  body: string;
  createdAt: string;
  sender: { id: string; displayName: string };
  recipientRead: boolean | null;
};

export type StaffRecipient = { id: string; displayName: string };

export type StaffRecipientPage = {
  items: StaffRecipient[];
  hasMore: boolean;
};

type OpenedStaffConversation<Kind extends StaffConversation["kind"]> = {
  id: string;
  kind: Kind;
  created: boolean;
};

export type StaffConversationPage = {
  items: StaffConversation[];
  nextCursor: string | null;
};

export type StaffMessagePage = {
  items: StaffMessage[];
  nextBefore: number | null;
};

export type SentStaffMessage = {
  id: string;
  conversationId: string;
  clientRequestId: string;
  sequence: number;
  body: string;
  createdAt: string;
  reused: boolean;
};

const basePath = "/ace/messages/conversations";

export async function searchStaffRecipients(
  search: string,
  signal?: AbortSignal,
): Promise<StaffRecipientPage> {
  if (isUsingMockApi()) return { items: [], hasMore: false };
  const query = new URLSearchParams({ search, limit: "20" });
  return request(`${basePath}/recipients?${query}`, { signal });
}

export async function openStaffDirectConversation(
  recipientUserId: string,
): Promise<OpenedStaffConversation<"STAFF_DIRECT">> {
  if (isUsingMockApi())
    throw new Error("Messaging is unavailable in mock mode.");
  return request(basePath, {
    method: "POST",
    body: JSON.stringify({ kind: "STAFF_DIRECT", recipientUserId }),
  });
}

export async function openStaffRoom(): Promise<
  OpenedStaffConversation<"STAFF_ROOM">
> {
  if (isUsingMockApi())
    throw new Error("Messaging is unavailable in mock mode.");
  return request(basePath, {
    method: "POST",
    body: JSON.stringify({ kind: "STAFF_ROOM" }),
  });
}

export async function fetchStaffConversations(
  input: {
    cursor?: string;
    signal?: AbortSignal;
  } = {},
): Promise<StaffConversationPage> {
  if (isUsingMockApi()) return { items: [], nextCursor: null };
  const query = new URLSearchParams({ limit: "30" });
  if (input.cursor) query.set("cursor", input.cursor);
  return request(`${basePath}?${query}`, { signal: input.signal });
}

export async function fetchStaffMessages(
  conversationId: string,
  input: { before?: number; signal?: AbortSignal } = {},
): Promise<StaffMessagePage> {
  if (isUsingMockApi()) return { items: [], nextBefore: null };
  const query = new URLSearchParams({ limit: "50" });
  if (input.before) query.set("before", String(input.before));
  return request(
    `${basePath}/${encodeURIComponent(conversationId)}/messages?${query}`,
    {
      signal: input.signal,
    },
  );
}

export async function sendStaffMessage(
  conversationId: string,
  input: { clientRequestId: string; body: string },
): Promise<SentStaffMessage> {
  if (isUsingMockApi())
    throw new Error("Messaging is unavailable in mock mode.");
  return request(`${basePath}/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function advanceStaffReadCursor(
  conversationId: string,
  sequence: number,
): Promise<void> {
  if (isUsingMockApi()) return;
  await request(
    `${basePath}/${encodeURIComponent(conversationId)}/read-cursor`,
    {
      method: "PUT",
      body: JSON.stringify({ sequence }),
    },
  );
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: buildAuthHeaders(),
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    throw await apiErrorFromResponse(
      response,
      "Unable to complete the messaging request. Try again.",
    );
  }
  return response.json() as Promise<T>;
}
