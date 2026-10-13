import { Injectable, Logger } from "@nestjs/common";
import {
  messageConversationRealtimeTopic,
  type MessageRealtimeEvent,
} from "@pathway/platform";

const BROADCAST_TIMEOUT_MS = 2_000;

@Injectable()
export class MessageRealtimePublisher {
  private readonly logger = new Logger(MessageRealtimePublisher.name);

  async publishAfterCommit(event: MessageRealtimeEvent): Promise<void> {
    const payload = safeRealtimePayload(event);
    const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
    const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
    if (!url || !secretKey) return;

    const topic = messageConversationRealtimeTopic(payload.conversationId);
    const endpoint = `${url}/realtime/v1/api/broadcast/${encodeURIComponent(topic)}/events/${payload.type}?private=true`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), BROADCAST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          apikey: secretKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Realtime broadcast failed");
    } catch {
      // REST history remains authoritative when a transient broadcast is lost.
      this.logger.warn("ACE message realtime broadcast unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeRealtimePayload(
  event: MessageRealtimeEvent,
): MessageRealtimeEvent {
  switch (event.type) {
    case "message.created":
      return {
        type: event.type,
        conversationId: event.conversationId,
        messageId: event.messageId,
      };
    case "conversation.read":
      return {
        type: event.type,
        conversationId: event.conversationId,
        readerScope: "participant",
      };
    case "typing.changed":
      return {
        type: event.type,
        conversationId: event.conversationId,
        active: event.active,
        expiresAt: event.expiresAt,
      };
  }
}
