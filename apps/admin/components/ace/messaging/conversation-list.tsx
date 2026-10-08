"use client";

import React from "react";
import { Button } from "@pathway/ui";
import type { StaffConversation } from "@/lib/ace-messaging-api";
import { ConversationAvatar } from "./conversation-avatar";
import { useStaffMessaging } from "./use-staff-messaging";

type MessagingState = ReturnType<typeof useStaffMessaging>;
const shortDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function ConversationList({
  messaging,
  schoolTeam = false,
}: {
  messaging: MessagingState;
  schoolTeam?: boolean;
}) {
  if (messaging.listLoading && messaging.conversations.length === 0) {
    return (
      <p role="status" className="px-5 py-6 text-sm text-text-muted">
        Loading conversations…
      </p>
    );
  }
  if (messaging.listError && messaging.conversations.length === 0) {
    return (
      <div className="space-y-3 px-5 py-6">
        <p role="alert" className="text-sm text-status-danger">
          {messaging.listError}
        </p>
        <Button type="button" variant="secondary" onClick={messaging.retryList}>
          Retry
        </Button>
      </div>
    );
  }
  if (messaging.conversations.length === 0) {
    return (
      <p role="status" className="px-5 py-6 text-sm leading-6 text-text-muted">
        {schoolTeam
          ? "No school team conversations are available for this site."
          : "No staff conversations are available for this site."}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ul
        className="flex-1 divide-y divide-border-subtle overflow-y-auto"
        aria-label={
          schoolTeam ? "School team conversations" : "Staff conversations"
        }
      >
        {messaging.conversations.map((conversation) => (
          <li key={conversation.id}>
            <ConversationRow
              conversation={conversation}
              selected={conversation.id === messaging.selectedId}
              onSelect={() => messaging.select(conversation.id)}
            />
          </li>
        ))}
      </ul>
      {messaging.listError ? (
        <p role="alert" className="px-5 py-2 text-sm text-status-danger">
          {messaging.listError}
        </p>
      ) : null}
      {messaging.nextCursor ? (
        <div className="border-t border-border-subtle p-3">
          <Button
            type="button"
            variant="secondary"
            className="w-full"
            disabled={messaging.listMoreLoading}
            onClick={() => void messaging.loadMoreConversations()}
          >
            {messaging.listMoreLoading ? "Loading…" : "Load more conversations"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ConversationRow({
  conversation,
  selected,
  onSelect,
}: {
  conversation: StaffConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-current={selected ? "true" : undefined}
      onClick={onSelect}
      className={`flex min-h-20 w-full items-center gap-3 border-l-[3px] px-4 py-3 text-left transition-colors motion-reduce:transition-none hover:bg-muted focus-visible:z-10 ${selected ? "border-teal-700 bg-accent-subtle" : "border-transparent"}`}
    >
      <ConversationAvatar title={conversation.title} />
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate font-semibold text-text-primary">
            {conversation.title}
          </span>
          <time
            className="shrink-0 text-xs text-text-muted"
            dateTime={conversation.updatedAt}
          >
            {shortDate.format(new Date(conversation.updatedAt))}
          </time>
        </span>
        <span className="mt-1 flex items-center justify-between gap-2">
          <span className="min-w-0 truncate text-sm text-text-muted">
            {conversation.latestMessage?.preview || "No messages yet"}
          </span>
          {conversation.unreadCount > 0 ? (
            <span className="flex min-h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-teal-700 px-1.5 text-xs font-semibold text-white">
              <span aria-hidden="true">
                {conversation.unreadCount > 99
                  ? "99+"
                  : conversation.unreadCount}
              </span>
              <span className="sr-only">
                {conversation.unreadCount} unread
                {conversation.unreadCount === 1 ? " message" : " messages"}
              </span>
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}
