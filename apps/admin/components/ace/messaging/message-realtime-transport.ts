import { createClient } from "@supabase/supabase-js";
import type { MessageRealtimeSubscription } from "@pathway/platform";
import type {
  MessageRealtimeObserver,
  MessageRealtimeTransport,
} from "@pathway/platform/messaging/realtime-connection";

export async function openMessageRealtimeTransport(
  subscription: MessageRealtimeSubscription,
  observer: MessageRealtimeObserver,
): Promise<MessageRealtimeTransport> {
  const client = createClient(subscription.url, subscription.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  await client.realtime.setAuth(subscription.token);
  let closed = false;
  const receive = (message: unknown) => {
    if (closed) return;
    const payload =
      typeof message === "object" && message !== null && "payload" in message
        ? message.payload
        : undefined;
    const notificationId =
      typeof payload === "object" &&
      payload !== null &&
      "notificationId" in payload &&
      typeof payload.notificationId === "string"
        ? payload.notificationId
        : undefined;
    observer.onEvent(notificationId ? { notificationId } : {});
  };
  client
    .channel(subscription.topic, { config: { private: true } })
    .on("broadcast", { event: "message.created" }, receive)
    .on("broadcast", { event: "conversation.read" }, receive)
    .subscribe((state) => {
      if (closed) return;
      if (state === "SUBSCRIBED") observer.onState("connected");
      else if (
        state === "CHANNEL_ERROR" ||
        state === "TIMED_OUT" ||
        state === "CLOSED"
      )
        observer.onState("disconnected");
    });
  return {
    setAuth: (token) => client.realtime.setAuth(token),
    close() {
      if (closed) return;
      closed = true;
      // The connection owns this client. removeAllChannels also tears down a
      // channel whose leave acknowledgement times out, then stops socket timers.
      void client
        .removeAllChannels()
        .catch(() => client.realtime.disconnect())
        .catch(() => observer.onState("disconnected"));
    },
  };
}
