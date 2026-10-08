import { isUsingMockApi } from "./api-client";
import { request, type StaffMessage } from "./ace-messaging-api";

export type ParentConversation = {
  id: string;
  kind: "PARENT_STAFF";
  title: "School team";
  latestMessage: { preview: string; createdAt: string } | null;
  updatedAt: string;
  unreadCount: number;
};

export type ParentMessage = Omit<StaffMessage, "recipientRead">;
export type ParentRecipient = { id: string; displayName: string };

const pathForSite = (siteId: string) =>
  `/ace/parent/sites/${encodeURIComponent(siteId)}/messages/conversations`;

function requireLiveMessaging(): void {
  if (isUsingMockApi()) {
    throw new Error("Family messaging is unavailable in mock mode.");
  }
}

export async function fetchParentConversation(
  siteId: string,
  signal?: AbortSignal,
): Promise<ParentConversation | null> {
  requireLiveMessaging();
  const page = await request<{ items: ParentConversation[] }>(
    pathForSite(siteId),
    {
      signal,
    },
  );
  return page.items[0] ?? null;
}

export async function searchParentResponders(
  siteId: string,
  search: string,
  signal?: AbortSignal,
): Promise<{ items: ParentRecipient[]; hasMore: boolean }> {
  requireLiveMessaging();
  const query = new URLSearchParams({ limit: "20" });
  if (search.trim()) query.set("search", search.trim());
  return request(`${pathForSite(siteId)}/recipients?${query}`, { signal });
}

export async function openParentConversation(
  siteId: string,
  recipientUserId: string,
): Promise<{ id: string; kind: "PARENT_STAFF"; created: boolean }> {
  requireLiveMessaging();
  return request(pathForSite(siteId), {
    method: "POST",
    body: JSON.stringify({ recipientUserId }),
  });
}

export async function fetchParentMessages(
  siteId: string,
  conversationId: string,
  input: { before?: number; signal?: AbortSignal } = {},
): Promise<{ items: ParentMessage[]; nextBefore: number | null }> {
  requireLiveMessaging();
  const query = new URLSearchParams({ limit: "50" });
  if (input.before) query.set("before", String(input.before));
  return request(
    `${pathForSite(siteId)}/${encodeURIComponent(conversationId)}/messages?${query}`,
    { signal: input.signal },
  );
}

export async function sendParentMessage(
  siteId: string,
  conversationId: string,
  input: { clientRequestId: string; body: string },
): Promise<{
  id: string;
  sequence: number;
  body: string;
  createdAt: string;
  reused: boolean;
}> {
  requireLiveMessaging();
  return request(
    `${pathForSite(siteId)}/${encodeURIComponent(conversationId)}/messages`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function advanceParentReadCursor(
  siteId: string,
  conversationId: string,
  sequence: number,
): Promise<void> {
  requireLiveMessaging();
  await request(
    `${pathForSite(siteId)}/${encodeURIComponent(conversationId)}/read-cursor`,
    { method: "PUT", body: JSON.stringify({ sequence }) },
  );
}
