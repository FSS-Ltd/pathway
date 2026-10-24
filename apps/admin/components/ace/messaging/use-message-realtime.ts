"use client";

import * as React from "react";
import {
  createMessageRealtimeConnection,
  type MessageRealtimeConnection,
  type MessageRealtimeStatus,
} from "@pathway/platform/messaging/realtime-connection";
import type { MessageRealtimeSubscription } from "@pathway/platform";
import { issueStaffRealtimeToken } from "@/lib/ace-messaging-api";
import { issueParentRealtimeToken } from "@/lib/ace-parent-messaging-api";
import { isMessageAccessDenied } from "./is-message-access-denied";
import { openMessageRealtimeTransport } from "./message-realtime-transport";

export type { MessageRealtimeStatus } from "@pathway/platform/messaging/realtime-connection";

type RealtimeScope = {
  kind: "staff" | "school-team" | "parent";
  userId: string;
  conversationId: string | null;
  siteId?: string;
  siteRevision?: number;
  onInvalidate(signal: AbortSignal): Promise<void>;
  onAccessDenied(): void;
  onRefreshError(error: unknown): void;
};

export function useMessageRealtime({
  kind,
  userId,
  conversationId,
  siteId,
  siteRevision,
  onInvalidate,
  onAccessDenied,
  onRefreshError,
}: RealtimeScope): { status: MessageRealtimeStatus; refresh: () => void } {
  const [status, setStatus] =
    React.useState<MessageRealtimeStatus>("connecting");
  const connectionRef = React.useRef<MessageRealtimeConnection | null>(null);
  const handlers = React.useRef({
    onInvalidate,
    onAccessDenied,
    onRefreshError,
  });
  handlers.current = { onInvalidate, onAccessDenied, onRefreshError };

  React.useEffect(() => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    const start = () => {
      const connection = createMessageRealtimeConnection({
        issueSubscription: (signal) =>
          fetchSubscription(kind, activeConversationId, siteId, signal),
        openTransport: openMessageRealtimeTransport,
        onStatus: setStatus,
        onInvalidate: (signal) => handlers.current.onInvalidate(signal),
        isAccessDenied: isMessageAccessDenied,
        onAccessDenied: () => handlers.current.onAccessDenied(),
        onRefreshError: (error) => handlers.current.onRefreshError(error),
      });
      connectionRef.current = connection;
    };
    const foreground = () => {
      if (document.visibilityState === "hidden") return;
      if (connectionRef.current) connectionRef.current.foreground();
      else start();
    };
    const visibility = () => {
      if (document.visibilityState === "hidden") {
        connectionRef.current?.stop();
        connectionRef.current = null;
        setStatus("disconnected");
      } else foreground();
    };
    window.addEventListener("focus", foreground);
    document.addEventListener("visibilitychange", visibility);
    if (document.visibilityState !== "hidden") start();
    return () => {
      connectionRef.current?.stop();
      connectionRef.current = null;
      window.removeEventListener("focus", foreground);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [kind, userId, conversationId, siteId, siteRevision]);

  const refresh = React.useCallback(() => connectionRef.current?.refresh(), []);
  return { status, refresh };
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
