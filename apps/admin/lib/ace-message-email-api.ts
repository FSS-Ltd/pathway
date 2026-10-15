import { isUsingMockApi } from "./api-client";
import { request } from "./ace-messaging-api";

export interface MessageEmailPreference {
  enabled: boolean;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string | null;
}

function requireLiveMessaging(): void {
  if (isUsingMockApi())
    throw new Error("Email alerts are unavailable in mock mode.");
}

export async function fetchMessageEmailPreference(
  path: string,
  signal?: AbortSignal,
) {
  requireLiveMessaging();
  return request<MessageEmailPreference>(path, { signal });
}

export async function saveMessageEmailPreference(
  path: string,
  input: Omit<MessageEmailPreference, "timezone">,
) {
  requireLiveMessaging();
  return request<MessageEmailPreference>(path, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export async function fetchConversationEmailMute(
  path: string,
  conversationId: string,
  signal?: AbortSignal,
) {
  requireLiveMessaging();
  return request<{ muted: boolean }>(
    `${path}/conversations/${encodeURIComponent(conversationId)}/mute`,
    { signal },
  );
}

export async function saveConversationEmailMute(
  path: string,
  conversationId: string,
  muted: boolean,
) {
  requireLiveMessaging();
  return request<{ muted: boolean }>(
    `${path}/conversations/${encodeURIComponent(conversationId)}/mute`,
    {
      method: "PUT",
      body: JSON.stringify({ muted }),
    },
  );
}
