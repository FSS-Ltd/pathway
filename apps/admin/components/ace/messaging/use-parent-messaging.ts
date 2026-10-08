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

export function useParentMessaging(siteId: string, userId: string) {
  const [conversation, setConversation] =
    React.useState<ParentConversation | null>(null);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [listRevision, setListRevision] = React.useState(0);
  const [messages, setMessages] = React.useState<StaffMessage[]>([]);
  const [nextBefore, setNextBefore] = React.useState<number | null>(null);
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

  React.useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);
    setConversation(null);
    setMessages([]);
    setDraft("");
    requestId.current = null;
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
    setMessages([]);
    setNextBefore(null);
    setThreadLoading(true);
    setThreadError(null);
    void fetchParentMessages(siteId, conversationId, {
      signal: controller.signal,
    })
      .then((page) => {
        if (current !== threadGeneration.current) return;
        setMessages(
          page.items
            .slice()
            .reverse()
            .map((item) => ({
              ...item,
              recipientRead: item.sender.id === userId ? false : null,
            })),
        );
        setNextBefore(page.nextBefore);
        const newest = page.items[0];
        if (newest) {
          void advanceParentReadCursor(
            siteId,
            conversationId,
            newest.sequence,
          ).catch(() => {
            if (current === threadGeneration.current) {
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
    if (!conversationId || !nextBefore || threadMoreLoading) return;
    const current = threadGeneration.current;
    setThreadMoreLoading(true);
    setThreadError(null);
    try {
      const page = await fetchParentMessages(siteId, conversationId, {
        before: nextBefore,
      });
      if (current !== threadGeneration.current) return;
      setMessages((items) => [
        ...page.items
          .slice()
          .reverse()
          .map((item) => ({
            ...item,
            recipientRead: item.sender.id === userId ? false : null,
          })),
        ...items,
      ]);
      setNextBefore(page.nextBefore);
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
    conversation,
    listLoading,
    listError,
    retryList: () => setListRevision((value) => value + 1),
    open,
    messages,
    nextBefore,
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
