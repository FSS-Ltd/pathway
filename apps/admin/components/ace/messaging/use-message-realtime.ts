"use client";

import * as React from "react";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import type { MessageRealtimeSubscription } from "@pathway/platform";
import { issueStaffRealtimeToken } from "@/lib/ace-messaging-api";
import { issueParentRealtimeToken } from "@/lib/ace-parent-messaging-api";

export type MessageRealtimeStatus = "connecting" | "live" | "polling";

type RealtimeScope = {
  kind: "staff" | "school-team" | "parent";
  conversationId: string | null;
  siteId?: string;
  siteRevision?: number;
  onInvalidate: () => void;
};

const POLL_INTERVAL_MS = 30_000;
const TOKEN_REFRESH_BUFFER_MS = 30_000;

export function useMessageRealtime({
  kind,
  conversationId,
  siteId,
  siteRevision,
  onInvalidate,
}: RealtimeScope): MessageRealtimeStatus {
  const [status, setStatus] =
    React.useState<MessageRealtimeStatus>("connecting");
  const invalidateRef = React.useRef(onInvalidate);
  invalidateRef.current = onInvalidate;

  React.useEffect(() => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    let active = true;
    let client: SupabaseClient | null = null;
    let channel: RealtimeChannel | null = null;
    let renewal: ReturnType<typeof setTimeout> | null = null;
    let request: AbortController | null = null;
    let connectionId = 0;

    const invalidate = () => invalidateRef.current();
    const cleanupChannel = () => {
      if (client && channel) void client.removeChannel(channel);
      channel = null;
      client = null;
    };
    const schedule = (delay: number) => {
      if (renewal) clearTimeout(renewal);
      renewal = setTimeout(() => void connect(), delay);
    };

    async function connect(): Promise<void> {
      const currentConnection = ++connectionId;
      request?.abort();
      cleanupChannel();
      if (!active) return;
      setStatus("connecting");
      const currentRequest = new AbortController();
      request = currentRequest;
      try {
        const subscription = await fetchSubscription(
          kind,
          activeConversationId,
          siteId,
          currentRequest.signal,
        );
        if (
          !active ||
          currentRequest.signal.aborted ||
          currentConnection !== connectionId
        )
          return;
        client = createClient(subscription.url, subscription.publishableKey, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
          },
        });
        client.realtime.setAuth(subscription.token);
        channel = client.channel(subscription.topic, {
          config: { private: true },
        });
        schedule(
          Math.max(
            5_000,
            Date.parse(subscription.expiresAt) -
              Date.now() -
              TOKEN_REFRESH_BUFFER_MS,
          ),
        );
        channel
          .on("broadcast", { event: "message.created" }, invalidate)
          .on("broadcast", { event: "conversation.read" }, invalidate)
          .subscribe((state) => {
            if (!active || currentConnection !== connectionId) return;
            if (state === "SUBSCRIBED") {
              setStatus("live");
              invalidate();
            } else if (
              state === "CHANNEL_ERROR" ||
              state === "TIMED_OUT" ||
              state === "CLOSED"
            ) {
              setStatus("polling");
              invalidate();
              schedule(POLL_INTERVAL_MS);
            }
          });
      } catch {
        if (
          !active ||
          currentRequest.signal.aborted ||
          currentConnection !== connectionId
        )
          return;
        setStatus("polling");
        schedule(POLL_INTERVAL_MS);
      }
    }

    const onFocus = () => invalidate();
    const onVisibility = () => {
      if (document.visibilityState === "visible") invalidate();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    const polling = setInterval(() => {
      if (document.visibilityState === "visible") invalidate();
    }, POLL_INTERVAL_MS);
    void connect();
    return () => {
      active = false;
      connectionId += 1;
      request?.abort();
      if (renewal) clearTimeout(renewal);
      clearInterval(polling);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
      cleanupChannel();
    };
  }, [kind, conversationId, siteId, siteRevision]);

  return status;
}

function fetchSubscription(
  kind: RealtimeScope["kind"],
  conversationId: string,
  siteId: string | undefined,
  signal: AbortSignal,
): Promise<MessageRealtimeSubscription> {
  if (kind === "parent") {
    if (!siteId) throw new Error("Parent site is required");
    return issueParentRealtimeToken(siteId, conversationId, signal);
  }
  return issueStaffRealtimeToken(conversationId, kind, signal);
}
