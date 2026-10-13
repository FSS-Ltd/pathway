"use client";

import * as React from "react";
import { requestFailure } from "@/lib/request-error";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  advanceStaffReadCursor,
  advanceSchoolTeamReadCursor,
  fetchSchoolTeamConversations,
  fetchSchoolTeamMessages,
  fetchStaffConversations,
  fetchStaffMessages,
  openStaffDirectConversation,
  openStaffRoom,
  sendStaffMessage,
  sendSchoolTeamMessage,
  type StaffConversation,
  type StaffMessage,
  type StaffRecipient,
} from "@/lib/ace-messaging-api";
import { useMessageRealtime } from "./use-message-realtime";
import { mergeMessageHistory } from "./merge-message-history";
import { isMessageAccessDenied } from "./is-message-access-denied";

export function useStaffMessaging(
  currentUserId: string,
  channel: "staff" | "school-team" = "staff",
) {
  const schoolTeam = channel === "school-team";
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
  const [nextMessageCursor, setNextMessageCursor] = React.useState<
    string | null
  >(null);
  const [threadLoading, setThreadLoading] = React.useState(false);
  const [threadError, setThreadError] = React.useState<string | null>(null);
  const [threadAccessLost, setThreadAccessLost] = React.useState(false);
  const [sendAccessLost, setSendAccessLost] = React.useState(false);
  const [threadMoreLoading, setThreadMoreLoading] = React.useState(false);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [sendError, setSendError] = React.useState<string | null>(null);
  const [roomOpening, setRoomOpening] = React.useState(false);
  const [roomError, setRoomError] = React.useState<string | null>(null);
  const siteGeneration = React.useRef(0);
  const threadGeneration = React.useRef(0);
  const selectedIdRef = React.useRef(selectedId);
  const openedConversation = React.useRef<StaffConversation | null>(null);
  const deniedThreadIds = React.useRef(new Set<string>());
  const deniedSendIds = React.useRef(new Set<string>());
  const requestIds = React.useRef<Record<string, string>>({});
  const lastReadAttempt = React.useRef<{
    conversationId: string;
    sequence: number;
  } | null>(null);
  const messagesRef = React.useRef(messages);
  const nextMessageCursorRef = React.useRef(nextMessageCursor);
  messagesRef.current = messages;
  nextMessageCursorRef.current = nextMessageCursor;
  selectedIdRef.current = selectedId;
  const realtimeStatus = useMessageRealtime({
    kind: channel,
    conversationId: selectedId,
    siteRevision,
    onInvalidate: () => {
      setListRevision((revision) => revision + 1);
      setThreadRevision((revision) => revision + 1);
    },
  });

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteGeneration.current += 1;
      threadGeneration.current += 1;
      selectedIdRef.current = null;
      openedConversation.current = null;
      deniedThreadIds.current.clear();
      deniedSendIds.current.clear();
      setConversations([]);
      messagesRef.current = [];
      nextMessageCursorRef.current = null;
      setNextCursor(null);
      setSelectedId(null);
      setMessages([]);
      setNextMessageCursor(null);
      setListError(null);
      setThreadError(null);
      setThreadAccessLost(false);
      setSendAccessLost(false);
      setSendError(null);
      setDrafts({});
      requestIds.current = {};
      lastReadAttempt.current = null;
      setRoomOpening(false);
      setRoomError(null);
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
    void (schoolTeam ? fetchSchoolTeamConversations : fetchStaffConversations)({
      signal: controller.signal,
    })
      .then((page) => {
        if (!active || generation !== siteGeneration.current) return;
        const opened = openedConversation.current;
        const items =
          opened && !page.items.some((item) => item.id === opened.id)
            ? [opened, ...page.items]
            : page.items;
        setConversations(
          items.map((item) =>
            deniedThreadIds.current.has(item.id)
              ? { ...item, latestMessage: null, unreadCount: 0 }
              : item,
          ),
        );
        setNextCursor(page.nextCursor);
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (isMessageAccessDenied(error)) {
          setConversations([]);
          setSelectedId(null);
          setMessages([]);
        }
        setListError(
          messageFrom(
            error,
            schoolTeam
              ? "School team messages are unavailable for this site."
              : "Unable to load conversations.",
          ),
        );
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [siteRevision, listRevision, schoolTeam]);

  React.useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setNextMessageCursor(null);
      setThreadLoading(false);
      return;
    }
    let active = true;
    const generation = ++threadGeneration.current;
    const controller = new AbortController();
    setThreadMoreLoading(false);
    setThreadLoading(true);
    setThreadError(null);
    void (schoolTeam ? fetchSchoolTeamMessages : fetchStaffMessages)(
      selectedId,
      {
        signal: controller.signal,
      },
    )
      .then((page) => {
        if (!active || generation !== threadGeneration.current) return;
        const latest = page.items
          .slice()
          .reverse()
          .map((item) => normalizeMessage(item, schoolTeam));
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
        if (deniedThreadIds.current.delete(selectedId)) {
          setListRevision((revision) => revision + 1);
        }
        setThreadAccessLost(false);
        const newest = page.items[0];
        if (
          newest &&
          (lastReadAttempt.current?.conversationId !== selectedId ||
            newest.sequence > lastReadAttempt.current.sequence)
        ) {
          lastReadAttempt.current = {
            conversationId: selectedId,
            sequence: newest.sequence,
          };
          void (
            schoolTeam ? advanceSchoolTeamReadCursor : advanceStaffReadCursor
          )(selectedId, newest.sequence)
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
            .catch((error: unknown) => {
              if (active && generation === threadGeneration.current) {
                if (isMessageAccessDenied(error)) {
                  denyThreadAccess();
                  return;
                }
                lastReadAttempt.current = null;
                setThreadError(
                  "Messages loaded, but read status could not be saved.",
                );
              }
            });
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return;
        if (isMessageAccessDenied(error)) {
          denyThreadAccess();
          return;
        }
        setThreadError(messageFrom(error, "Unable to load messages."));
      })
      .finally(() => {
        if (active) setThreadLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedId, siteRevision, threadRevision, schoolTeam]);

  async function loadMoreConversations() {
    if (!nextCursor || listMoreLoading) return;
    const generation = siteGeneration.current;
    setListMoreLoading(true);
    setListError(null);
    try {
      const page = await (
        schoolTeam ? fetchSchoolTeamConversations : fetchStaffConversations
      )({ cursor: nextCursor });
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
    if (!selectedId || !nextMessageCursor || threadMoreLoading) return;
    const conversationId = selectedId;
    const generation = threadGeneration.current;
    setThreadMoreLoading(true);
    setThreadError(null);
    try {
      const page = await (
        schoolTeam ? fetchSchoolTeamMessages : fetchStaffMessages
      )(conversationId, {
        cursor: nextMessageCursor,
      });
      if (generation !== threadGeneration.current) return;
      setMessages((current) => [
        ...page.items
          .slice()
          .reverse()
          .map((item) => normalizeMessage(item, schoolTeam)),
        ...current,
      ]);
      setNextMessageCursor(page.nextCursor);
    } catch (error) {
      if (generation === threadGeneration.current) {
        if (isMessageAccessDenied(error)) {
          denyThreadAccess();
        } else {
          setThreadError(messageFrom(error, "Unable to load older messages."));
        }
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
    if (!selectedId || sendingId || threadAccessLost || sendAccessLost) return;
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
      const sent = await (
        schoolTeam ? sendSchoolTeamMessage : sendStaffMessage
      )(conversationId, {
        clientRequestId,
        body,
      });
      if (site !== siteGeneration.current) return;
      delete requestIds.current[conversationId];
      setDrafts((current) => ({ ...current, [conversationId]: "" }));
      if (selectedIdRef.current === conversationId) {
        const directConversation = conversations.some(
          (item) => item.id === conversationId && item.kind === "STAFF_DIRECT",
        );
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
                  recipientRead: directConversation ? false : null,
                  deliveryState: directConversation ? "sent" : null,
                },
              ],
        );
      }
      setListRevision((revision) => revision + 1);
    } catch (error) {
      if (
        site === siteGeneration.current &&
        selectedIdRef.current === conversationId
      ) {
        if (isMessageAccessDenied(error)) {
          deniedSendIds.current.add(conversationId);
          setSendAccessLost(true);
          denyThreadAccess();
        } else {
          setSendError(
            messageFrom(error, "Unable to send your message. Try again."),
          );
        }
      }
    } finally {
      if (site === siteGeneration.current) setSendingId(null);
    }
  }

  function selectConversation(id: string | null) {
    if (id && id === selectedIdRef.current) {
      setThreadRevision((revision) => revision + 1);
      return;
    }
    threadGeneration.current += 1;
    selectedIdRef.current = id;
    lastReadAttempt.current = null;
    setSelectedId(id);
    messagesRef.current = [];
    nextMessageCursorRef.current = null;
    setMessages([]);
    setNextMessageCursor(null);
    setThreadError(null);
    setThreadAccessLost(id ? deniedThreadIds.current.has(id) : false);
    setSendAccessLost(id ? deniedSendIds.current.has(id) : false);
    setThreadMoreLoading(false);
    setSendError(null);
    setRoomError(null);
  }

  function denyThreadAccess() {
    threadGeneration.current += 1;
    const deniedId = selectedIdRef.current;
    if (deniedId) deniedThreadIds.current.add(deniedId);
    setConversations((current) =>
      current.map((conversation) =>
        conversation.id === deniedId
          ? { ...conversation, latestMessage: null, unreadCount: 0 }
          : conversation,
      ),
    );
    if (openedConversation.current?.id === deniedId) {
      openedConversation.current = {
        ...openedConversation.current,
        latestMessage: null,
        unreadCount: 0,
      };
    }
    messagesRef.current = [];
    nextMessageCursorRef.current = null;
    lastReadAttempt.current = null;
    setMessages([]);
    setNextMessageCursor(null);
    setThreadLoading(false);
    setThreadMoreLoading(false);
    setThreadError(null);
    setSendError(null);
    setThreadAccessLost(true);
  }

  function selectOpenedConversation(
    opened: Pick<StaffConversation, "id"> & {
      kind: "STAFF_DIRECT" | "STAFF_ROOM";
    },
    title: string,
  ) {
    const summary: StaffConversation = {
      id: opened.id,
      kind: opened.kind,
      title,
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
  }

  async function startDirectConversation(
    recipient: StaffRecipient,
  ): Promise<boolean> {
    const site = siteGeneration.current;
    const opened = await openStaffDirectConversation(recipient.id);
    if (site !== siteGeneration.current) return false;
    selectOpenedConversation(opened, recipient.displayName);
    return true;
  }

  async function startStaffRoom(): Promise<void> {
    if (roomOpening) return;
    const site = siteGeneration.current;
    setRoomOpening(true);
    setRoomError(null);
    try {
      const opened = await openStaffRoom();
      if (site !== siteGeneration.current) return;
      selectOpenedConversation(opened, "Staff room");
    } catch (error) {
      if (site === siteGeneration.current) {
        setRoomError(messageFrom(error, "Unable to open the staff room."));
      }
    } finally {
      if (site === siteGeneration.current) setRoomOpening(false);
    }
  }

  return {
    realtimeStatus,
    siteRevision,
    conversations,
    nextCursor,
    listLoading,
    listError,
    listMoreLoading,
    selectedId,
    select: selectConversation,
    startDirectConversation,
    startStaffRoom,
    roomOpening,
    roomError,
    messages,
    nextMessageCursor,
    threadLoading,
    threadError,
    threadAccessLost,
    sendAccessLost,
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
  return requestFailure(error, fallback).message;
}

function normalizeMessage(
  item: StaffMessage | Omit<StaffMessage, "recipientRead">,
  schoolTeam: boolean,
): StaffMessage {
  const recipientRead =
    !schoolTeam &&
    "recipientRead" in item &&
    typeof item.recipientRead === "boolean"
      ? item.recipientRead
      : null;
  return {
    ...item,
    recipientRead,
    deliveryState: schoolTeam
      ? null
      : (item.deliveryState ??
        (recipientRead === null ? null : recipientRead ? "read" : "sent")),
  };
}
