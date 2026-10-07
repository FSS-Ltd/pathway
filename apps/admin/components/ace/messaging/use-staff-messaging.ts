"use client";

import * as React from "react";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  advanceStaffReadCursor,
  fetchStaffConversations,
  fetchStaffMessages,
  openStaffDirectConversation,
  sendStaffMessage,
  type StaffConversation,
  type StaffMessage,
  type StaffRecipient,
} from "@/lib/ace-messaging-api";

export function useStaffMessaging(currentUserId: string) {
  const [siteRevision, setSiteRevision] = React.useState(0);
  const [listRevision, setListRevision] = React.useState(0);
  const [threadRevision, setThreadRevision] = React.useState(0);
  const [conversations, setConversations] = React.useState<StaffConversation[]>(
    [],
  );
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [listLoading, setListLoading] = React.useState(true);
  const [listError, setListError] = React.useState<string | null>(null);
  const [listMoreLoading, setListMoreLoading] = React.useState(false);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<StaffMessage[]>([]);
  const [nextBefore, setNextBefore] = React.useState<number | null>(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [threadError, setThreadError] = React.useState<string | null>(null);
  const [threadMoreLoading, setThreadMoreLoading] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const siteGeneration = React.useRef(0);
  const threadGeneration = React.useRef(0);
  const selectedIdRef = React.useRef(selectedId);
  const openedConversation = React.useRef<StaffConversation | null>(null);
  const requestIds = React.useRef<Record<string, string>>({});
  selectedIdRef.current = selectedId;

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteGeneration.current += 1;
      threadGeneration.current += 1;
      selectedIdRef.current = null;
      openedConversation.current = null;
      setConversations([]);
      setNextCursor(null);
      setSelectedId(null);
      setMessages([]);
      setNextBefore(null);
      setListError(null);
      setThreadError(null);
      setSendError(null);
      setListMoreLoading(false);
      setThreadMoreLoading(false);
      setSendingId(null);
      setSiteRevision((revision) => revision + 1);
    });
    return () => {
      siteGeneration.current += 1;
      threadGeneration.current += 1;
      unsubscribe();
    };
  }, []);

  React.useEffect(() => {
    let active = true;
    const generation = siteGeneration.current;
    const controller = new AbortController();
    setListLoading(true);
    setListError(null);
    void fetchStaffConversations({ signal: controller.signal })
      .then((page) => {
        if (!active || generation !== siteGeneration.current) return;
        const opened = openedConversation.current;
        setConversations(
          opened && !page.items.some((item) => item.id === opened.id)
            ? [opened, ...page.items]
            : page.items,
        );
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setListError(messageFrom(error, "Unable to load conversations."));
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [siteRevision, listRevision]);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setNextBefore(null);
      setThreadLoading(false);
      return;
    }
    let active = true;
    const generation = ++threadGeneration.current;
    const controller = new AbortController();
    setMessages([]);
    setNextBefore(null);
    setThreadMoreLoading(false);
    setThreadLoading(true);
    setThreadError(null);
    void fetchStaffMessages(selectedId, { signal: controller.signal })
      .then((page) => {
        if (!active || generation !== threadGeneration.current) return;
        setMessages(page.items.slice().reverse());
        setNextBefore(page.nextBefore);
        const newest = page.items[0];
        if (newest) {
          void advanceStaffReadCursor(selectedId, newest.sequence)
            .then(() => {
              if (!active || generation !== threadGeneration.current) return;
              if (openedConversation.current?.id === selectedId) {
                openedConversation.current = {
                  ...openedConversation.current,
                  unreadCount: 0,
                };
              }
              setListRevision((revision) => revision + 1);
            })
            .catch(() => {
              if (active && generation === threadGeneration.current) {
                setThreadError(
                  "Messages loaded, but read status could not be saved.",
                );
              }
            });
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        setThreadError(messageFrom(error, "Unable to load messages."));
      })
      .finally(() => {
        if (active) setThreadLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId, siteRevision, threadRevision]);

  async function loadMoreConversations() {
    if (!nextCursor || listMoreLoading) return;
    const generation = siteGeneration.current;
    setListMoreLoading(true);
    setListError(null);
    try {
      const page = await fetchStaffConversations({ cursor: nextCursor });
      if (generation !== siteGeneration.current) return;
      setConversations((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...page.items.filter((item) => !seen.has(item.id))];
      });
      setNextCursor(page.nextCursor);
    } catch (error) {
      if (generation === siteGeneration.current) {
        setListError(messageFrom(error, "Unable to load more conversations."));
      }
    } finally {
      if (generation === siteGeneration.current) setListMoreLoading(false);
    }
  }

  async function loadOlderMessages() {
    if (!selectedId || !nextBefore || threadMoreLoading) return;
    const conversationId = selectedId;
    const generation = threadGeneration.current;
    setThreadMoreLoading(true);
    setThreadError(null);
    try {
      const page = await fetchStaffMessages(conversationId, {
        before: nextBefore,
      });
      if (generation !== threadGeneration.current) return;
      setMessages((current) => [...page.items.slice().reverse(), ...current]);
      setNextBefore(page.nextBefore);
    } catch (error) {
      if (generation === threadGeneration.current) {
        setThreadError(messageFrom(error, "Unable to load older messages."));
      }
    } finally {
      if (generation === threadGeneration.current) setThreadMoreLoading(false);
    }
  }

  function changeDraft(value: string) {
    if (!selectedId) return;
    delete requestIds.current[selectedId];
    setDrafts((current) => ({ ...current, [selectedId]: value }));
    setSendError(null);
  }

  async function send() {
    if (!selectedId || sendingId) return;
    const conversationId = selectedId;
    const body = drafts[conversationId]?.trim();
    if (!body || body.length > 4000) return;
    const clientRequestId =
      requestIds.current[conversationId] ?? crypto.randomUUID();
    requestIds.current[conversationId] = clientRequestId;
    const site = siteGeneration.current;
    setSendingId(conversationId);
    setSendError(null);
    try {
      const sent = await sendStaffMessage(conversationId, {
        clientRequestId,
        body,
      });
      if (site !== siteGeneration.current) return;
      delete requestIds.current[conversationId];
      setDrafts((current) => ({ ...current, [conversationId]: "" }));
      if (selectedIdRef.current === conversationId) {
        setMessages((current) =>
          current.some((message) => message.id === sent.id)
            ? current
            : [
                ...current,
                {
                  id: sent.id,
                  sequence: sent.sequence,
                  body: sent.body,
                  createdAt: sent.createdAt,
                  sender: { id: currentUserId, displayName: "You" },
                  recipientRead:
                    conversations.find((item) => item.id === conversationId)
                      ?.kind === "STAFF_DIRECT"
                      ? false
                      : null,
                },
              ],
        );
      }
      setListRevision((revision) => revision + 1);
    } catch (error) {
      if (site === siteGeneration.current) {
        setSendError(
          messageFrom(error, "Unable to send your message. Try again."),
        );
      }
    } finally {
      if (site === siteGeneration.current) setSendingId(null);
    }
  }

  function selectConversation(id: string | null) {
    threadGeneration.current += 1;
    selectedIdRef.current = id;
    setSelectedId(id);
    setMessages([]);
    setNextBefore(null);
    setThreadError(null);
    setThreadMoreLoading(false);
    setSendError(null);
  }

  async function startDirectConversation(
    recipient: StaffRecipient,
  ): Promise<boolean> {
    const site = siteGeneration.current;
    const opened = await openStaffDirectConversation(recipient.id);
    if (site !== siteGeneration.current) return false;
    const summary: StaffConversation = {
      id: opened.id,
      kind: opened.kind,
      title: recipient.displayName,
      latestMessage: null,
      updatedAt: new Date().toISOString(),
      unreadCount: 0,
    };
    openedConversation.current =
      conversations.find((conversation) => conversation.id === opened.id) ??
      summary;
    setConversations((current) =>
      current.some((conversation) => conversation.id === opened.id)
        ? current
        : [summary, ...current],
    );
    selectConversation(opened.id);
    return true;
  }

  return {
    siteRevision,
    conversations,
    nextCursor,
    listLoading,
    listError,
    listMoreLoading,
    selectedId,
    select: selectConversation,
    startDirectConversation,
    messages,
    nextBefore,
    threadLoading,
    threadError,
    threadMoreLoading,
    draft: selectedId ? (drafts[selectedId] ?? "") : "",
    sending: sendingId !== null,
    sendError,
    changeDraft,
    send,
    loadMoreConversations,
    loadOlderMessages,
    retryList: () => setListRevision((revision) => revision + 1),
    retryThread: () => setThreadRevision((revision) => revision + 1),
  };
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}
