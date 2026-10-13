"use client";

import * as React from "react";
import type { StaffMessage } from "@/lib/ace-messaging-api";
import {
  advanceParentReadCursor,
  fetchParentConversation,
  fetchParentMessages,
  openParentConversation,
  sendParentMessage,
  type ParentConversation,
} from "@/lib/ace-parent-messaging-api";
import { requestFailure } from "@/lib/request-error";
import { ApiError } from "@/lib/api-transport";
import { useMessageRealtime } from "./use-message-realtime";
import { mergeMessageHistory } from "./merge-message-history";

export function useParentMessaging(siteId: string, userId: string) {
  const [conversation, setConversation] =
    React.useState<ParentConversation | null>(null);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [listRevision, setListRevision] = React.useState(0);
  const [messages, setMessages] = React.useState<StaffMessage[]>([]);
  const [nextMessageCursor, setNextMessageCursor] = React.useState<
    string | null
  >(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [threadError, setThreadError] = React.useState<string | null>(null);
  const [threadMoreLoading, setThreadMoreLoading] = React.useState(false);
  const [threadRevision, setThreadRevision] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [sending, setSending] = React.useState(false);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const threadGeneration = React.useRef(0);
  const requestId = React.useRef<string | null>(null);
  const lastReadAttempt = React.useRef<{
    conversationId: string;
    sequence: number;
  } | null>(null);
  const messagesRef = React.useRef(messages);
  const nextMessageCursorRef = React.useRef(nextMessageCursor);
  messagesRef.current = messages;
  nextMessageCursorRef.current = nextMessageCursor;
  const identityRef = React.useRef<string | null>(null);
  const realtimeStatus = useMessageRealtime({
    kind: "parent",
    conversationId: conversation?.id ?? null,
    siteId,
    onInvalidate: () => {
      setListRevision((revision) => revision + 1);
      setThreadRevision((revision) => revision + 1);
    },
  });

  React.useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);
    const identity = `${siteId}:${userId}`;
    if (identityRef.current !== identity) {
      identityRef.current = identity;
      setConversation(null);
      setMessages([]);
      messagesRef.current = [];
      nextMessageCursorRef.current = null;
      setDraft("");
      requestId.current = null;
      lastReadAttempt.current = null;
    }
    void fetchParentConversation(siteId, controller.signal)
      .then((item) => {
        if (current === generation.current) setConversation(item);
      })
      .catch((error: unknown) => {
        if (current !== generation.current || controller.signal.aborted) return;
        setListError(
          requestFailure(error, "Your school messages could not be loaded.")
            .message,
        );
        setConversation(null);
        setMessages([]);
        messagesRef.current = [];
        nextMessageCursorRef.current = null;
      })
      .finally(() => {
        if (current === generation.current) setListLoading(false);
      });
    return () => {
      generation.current += 1;
      controller.abort();
    };
  }, [siteId, userId, listRevision]);

  const conversationId = conversation?.id;
  React.useEffect(() => {
    const current = ++threadGeneration.current;
    if (!conversationId) return;
    const controller = new AbortController();
    setThreadLoading(true);
    setThreadError(null);
    void fetchParentMessages(siteId, conversationId, {
      signal: controller.signal,
    })
      .then((page) => {
        if (current !== threadGeneration.current) return;
        const latest = page.items
          .slice()
          .reverse()
          .map((item) => normalizeParentMessage(item, userId));
        const merged = mergeMessageHistory(
          messagesRef.current,
          latest,
          nextMessageCursorRef.current,
          page.nextCursor,
        );
        messagesRef.current = merged.messages;
        nextMessageCursorRef.current = merged.nextCursor;
        setMessages(merged.messages);
        setNextMessageCursor(merged.nextCursor);
        const newest = page.items[0];
        if (
          newest &&
          (lastReadAttempt.current?.conversationId !== conversationId ||
            newest.sequence > lastReadAttempt.current.sequence)
        ) {
          lastReadAttempt.current = {
            conversationId,
            sequence: newest.sequence,
          };
          void advanceParentReadCursor(
            siteId,
            conversationId,
            newest.sequence,
          ).catch(() => {
            if (current === threadGeneration.current) {
              lastReadAttempt.current = null;
              setThreadError(
                "Messages loaded, but read status could not be saved.",
              );
            }
          });
        }
      })
      .catch((error: unknown) => {
        if (current !== threadGeneration.current || controller.signal.aborted)
          return;
        if (
          error instanceof ApiError &&
          [401, 403, 404].includes(error.status)
        ) {
          messagesRef.current = [];
          nextMessageCursorRef.current = null;
          setMessages([]);
          setNextMessageCursor(null);
        }
        setThreadError(
          requestFailure(error, "Unable to load messages.").message,
        );
      })
      .finally(() => {
        if (current === threadGeneration.current) setThreadLoading(false);
      });
    return () => {
      threadGeneration.current += 1;
      controller.abort();
    };
  }, [siteId, userId, conversationId, threadRevision]);

  async function open(recipientUserId: string): Promise<boolean> {
    const current = generation.current;
    const opened = await openParentConversation(siteId, recipientUserId);
    if (current !== generation.current) return false;
    setConversation({
      id: opened.id,
      kind: "PARENT_STAFF",
      title: "School team",
      latestMessage: null,
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
    });
    return true;
  }

  async function loadOlderMessages(): Promise<void> {
    if (!conversationId || !nextMessageCursor || threadMoreLoading) return;
    const current = threadGeneration.current;
    setThreadMoreLoading(true);
    setThreadError(null);
    try {
      const page = await fetchParentMessages(siteId, conversationId, {
        cursor: nextMessageCursor,
      });
      if (current !== threadGeneration.current) return;
      setMessages((items) => [
        ...page.items
          .slice()
          .reverse()
          .map((item) => normalizeParentMessage(item, userId)),
        ...items,
      ]);
      setNextMessageCursor(page.nextCursor);
    } catch (error) {
      if (current === threadGeneration.current) {
        setThreadError(
          requestFailure(error, "Unable to load older messages.").message,
        );
      }
    } finally {
      if (current === threadGeneration.current) setThreadMoreLoading(false);
    }
  }

  function changeDraft(value: string): void {
    requestId.current = null;
    setDraft(value);
    setSendError(null);
  }

  async function send(): Promise<void> {
    if (!conversationId || sending) return;
    const body = draft.trim();
    if (!body || body.length > 4000) return;
    const clientRequestId = requestId.current ?? crypto.randomUUID();
    requestId.current = clientRequestId;
    const current = generation.current;
    setSending(true);
    setSendError(null);
    try {
      const sent = await sendParentMessage(siteId, conversationId, {
        clientRequestId,
        body,
      });
      if (current !== generation.current) return;
      requestId.current = null;
      setDraft("");
      setMessages((items) =>
        items.some((item) => item.id === sent.id)
          ? items
          : [
              ...items,
              {
                id: sent.id,
                sequence: sent.sequence,
                body: sent.body,
                createdAt: sent.createdAt,
                sender: { id: userId, displayName: "You" },
                recipientRead: false,
                deliveryState: "sent",
              },
            ],
      );
      setConversation(
        (item) =>
          item && {
            ...item,
            latestMessage: {
              preview: sent.body.slice(0, 160),
              createdAt: sent.createdAt,
            },
            updatedAt: sent.createdAt,
          },
      );
    } catch (error) {
      if (current === generation.current) {
        setSendError(
          requestFailure(error, "Unable to send your message. Try again.")
            .message,
        );
      }
    } finally {
      if (current === generation.current) setSending(false);
    }
  }

  return {
    realtimeStatus,
    conversation,
    listLoading,
    listError,
    retryList: () => setListRevision((value) => value + 1),
    open,
    messages,
    nextMessageCursor,
    threadLoading,
    threadError,
    threadMoreLoading,
    retryThread: () => setThreadRevision((value) => value + 1),
    loadOlderMessages,
    draft,
    sending,
    sendError,
    changeDraft,
    send,
  };
}

function normalizeParentMessage(
  item: Omit<StaffMessage, "recipientRead">,
  userId: string,
): StaffMessage {
  const deliveryState =
    item.deliveryState ?? (item.sender.id === userId ? "sent" : null);
  return {
    ...item,
    deliveryState,
    recipientRead: deliveryState === null ? null : deliveryState === "read",
  };
}
