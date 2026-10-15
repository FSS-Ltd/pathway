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
  refetchOn: readonly ["reconnect", "event_loss", "token_refresh"];
}

export function messageConversationRealtimeTopic(
  conversationId: string,
): string {
  return `ace:conversation:${conversationId}`;
}
