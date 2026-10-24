export type MessageRealtimeEvent =
  | { type: "message.created"; conversationId: string; messageId: string }
  | {
      type: "conversation.read";
      conversationId: string;
      readerScope: "participant";
    }
  | {
      type: "typing.changed";
      conversationId: string;
      active: boolean;
      expiresAt: string;
    };

export interface MessageRealtimeSubscription {
  token: string;
  topic: string;
  url: string;
  publishableKey: string;
  private: true;
  expiresAt: string;
  authoritativeSource: "rest";
  refetchOn: readonly ["reconnect", "event_loss"];
}

/** One private inbox per user/site; encode segments to prevent delimiter collisions. */
export function messageUserRealtimeTopic(
  siteId: string,
  userId: string,
): string {
  const encode = (value: string) =>
    Array.from(new TextEncoder().encode(value), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
  return `ace:conversation:site:${encode(siteId)}:user:${encode(userId)}`;
}
