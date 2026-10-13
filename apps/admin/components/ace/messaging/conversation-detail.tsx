"use client";

import * as React from "react";
import { Button } from "@pathway/ui";
import type { StaffConversation, StaffMessage } from "@/lib/ace-messaging-api";
import { ConversationAvatar } from "./conversation-avatar";
import type { MessageRealtimeStatus } from "./use-message-realtime";

export type MessageDetailState = {
  realtimeStatus: MessageRealtimeStatus;
  messages: StaffMessage[];
  nextMessageCursor: string | null;
  threadLoading: boolean;
  threadError: string | null;
  threadAccessLost: boolean;
  sendAccessLost: boolean;
  threadMoreLoading: boolean;
  draft: string;
  sending: boolean;
  sendError: string | null;
  loadOlderMessages: () => Promise<void>;
  retryThread: () => void;
  changeDraft: (value: string) => void;
  send: () => Promise<void>;
};
type ConversationIdentity = Pick<StaffConversation, "id" | "title" | "kind">;
const shortTime = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function ConversationDetail({
  conversation,
  currentUserId,
  canSend,
  messaging,
  onBack,
  headingRef,
  composerId = "staff-message-draft",
  contextLabel,
}: {
  conversation: ConversationIdentity;
  currentUserId: string;
  canSend: boolean;
  messaging: MessageDetailState;
  onBack?: () => void;
  headingRef?: React.Ref<HTMLHeadingElement>;
  composerId?: string;
  contextLabel?: string;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const latestSequence = messaging.messages.at(-1)?.sequence;
  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "auto" });
  }, [conversation.id, latestSequence]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border-subtle bg-surface/95 px-4 py-3 sm:px-6">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 rounded-lg px-2 text-sm font-medium text-teal-700 md:hidden"
            aria-label="Back to conversations"
          >
            ‹ Back
          </button>
        ) : null}
        <ConversationAvatar title={conversation.title} />
        <div className="min-w-0">
          <h2
            ref={headingRef}
            tabIndex={headingRef ? -1 : undefined}
            className="truncate rounded-sm font-heading text-lg font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            {conversation.title}
          </h2>
          <p className="text-xs text-text-muted">
            {contextLabel ??
              (conversation.kind === "STAFF_ROOM"
                ? "Staff room"
                : conversation.kind === "PARENT_STAFF"
                  ? "Your school team"
                  : "Direct staff conversation")}
          </p>
          <p
            className="mt-1 flex items-center gap-1.5 text-xs text-text-muted"
            role="status"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 rounded-full ${messaging.realtimeStatus === "live" ? "bg-status-success" : "bg-status-warning"}`}
            />
            {messaging.realtimeStatus === "live"
              ? "Live updates"
              : messaging.realtimeStatus === "connecting"
                ? "Connecting updates…"
                : "Refreshing automatically"}
          </p>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto bg-shell/70 px-4 pb-6 sm:px-8"
        aria-label="Messages"
      >
        {messaging.threadAccessLost ? (
          <div role="alert" className="mx-auto max-w-md py-12 text-center">
            <h3 className="font-heading text-lg font-semibold text-text-primary">
              Conversation unavailable
            </h3>
            <p className="mt-2 text-sm leading-6 text-text-muted">
              Your access may have changed. Check with your school if this
              continues.
            </p>
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              onClick={messaging.retryThread}
              disabled={messaging.threadLoading}
            >
              {messaging.threadLoading ? "Checking…" : "Try again"}
            </Button>
          </div>
        ) : null}
        {!messaging.threadAccessLost && messaging.nextMessageCursor ? (
          <div className="mb-5 text-center">
            <Button
              type="button"
              variant="secondary"
              disabled={messaging.threadMoreLoading}
              onClick={() => void messaging.loadOlderMessages()}
            >
              {messaging.threadMoreLoading ? "Loading…" : "Load older messages"}
            </Button>
          </div>
        ) : null}
        {messaging.threadLoading ? (
          <p role="status" className="text-center text-sm text-text-muted">
            Loading messages…
          </p>
        ) : null}
        {!messaging.threadAccessLost && messaging.threadError ? (
          <div className="mb-4 flex items-center justify-center gap-3">
            <p role="alert" className="text-sm text-status-danger">
              {messaging.threadError}
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={messaging.retryThread}
            >
              Retry
            </Button>
          </div>
        ) : null}
        {!messaging.threadAccessLost &&
        !messaging.threadLoading &&
        !messaging.threadError &&
        messaging.messages.length === 0 ? (
          <p
            role="status"
            className="py-16 text-center text-sm text-text-muted"
          >
            {canSend
              ? "No messages yet. Start the conversation below."
              : "No messages yet."}
          </p>
        ) : null}
        {!messaging.threadAccessLost ? (
          <MessageList
            messages={messaging.messages}
            currentUserId={currentUserId}
          />
        ) : null}
        <div ref={endRef} />
      </div>

      {!messaging.threadAccessLost ? (
        <MessageComposer
          canSend={canSend && !messaging.sendAccessLost}
          messaging={messaging}
          composerId={composerId}
        />
      ) : null}
    </>
  );
}

function MessageList({
  messages,
  currentUserId,
}: {
  messages: StaffMessage[];
  currentUserId: string;
}) {
  const latestOutgoingId = messages.reduce<string | null>(
    (latest, message) =>
      message.sender.id === currentUserId && message.deliveryState !== null
        ? message.id
        : latest,
    null,
  );
  return (
    <ol aria-live="polite" aria-relevant="additions text">
      {messages.map((message, index) => {
        const previous = messages[index - 1];
        const createdAt = new Date(message.createdAt);
        const date = shortDate.format(createdAt);
        const groupedWithPrevious = isSameMessageGroup(previous, message);
        const groupedWithNext = isSameMessageGroup(
          message,
          messages[index + 1],
        );
        const showDate =
          !previous || date !== shortDate.format(new Date(previous.createdAt));
        const outgoing = message.sender.id === currentUserId;
        const bubbleTone = outgoing
          ? "bg-teal-700 text-white"
          : "border border-border-subtle bg-surface text-text-primary";
        const bubbleTail = groupedWithNext
          ? ""
          : outgoing
            ? "rounded-br-md"
            : "rounded-bl-md";
        return (
          <li
            key={message.id}
            className={
              showDate ? "pt-5" : groupedWithPrevious ? "pt-1" : "pt-4"
            }
          >
            {showDate ? (
              <div className="mb-5 flex justify-center">
                <time
                  dateTime={message.createdAt}
                  className="rounded-full border border-border-subtle bg-surface px-3 py-1 text-xs font-semibold text-text-muted shadow-sm"
                >
                  {date}
                </time>
              </div>
            ) : null}
            <div
              className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[min(88%,34rem)]">
                <div
                  className={`rounded-[1.375rem] px-4 py-2.5 shadow-sm ${bubbleTone} ${bubbleTail}`}
                >
                  {!outgoing && !groupedWithPrevious ? (
                    <p
                      aria-hidden="true"
                      className="mb-1 text-xs font-semibold text-text-muted"
                    >
                      {message.sender.displayName}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    <span className="sr-only">
                      {outgoing ? "You" : message.sender.displayName}:{" "}
                    </span>
                    {message.body}
                  </p>
                  <time
                    dateTime={message.createdAt}
                    className={
                      groupedWithNext
                        ? "sr-only"
                        : `mt-1 block text-right text-xs ${outgoing ? "text-white" : "text-text-muted"}`
                    }
                  >
                    {shortTime.format(createdAt)}
                  </time>
                </div>
                {message.id === latestOutgoingId ? (
                  <p className="mt-1 text-right text-xs text-text-muted">
                    {message.deliveryState === "read"
                      ? "Read"
                      : message.deliveryState === "delivered"
                        ? "Delivered"
                        : "Sent"}
                  </p>
                ) : null}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function MessageComposer({
  canSend,
  messaging,
  composerId,
}: {
  canSend: boolean;
  messaging: MessageDetailState;
  composerId: string;
}) {
  if (!canSend) {
    return (
      <p className="border-t border-border-subtle bg-surface px-5 py-4 text-sm text-text-muted">
        {messaging.sendAccessLost
          ? "Sending access has changed. You can still read this conversation. Refresh the page if your school restores sending access."
          : "You can read this conversation, but you do not have permission to send messages."}
      </p>
    );
  }
  const canSubmit =
    messaging.draft.trim().length > 0 &&
    messaging.draft.trim().length <= 4000 &&
    !messaging.sending;
  return (
    <form
      className="border-t border-border-subtle bg-surface/95 px-4 py-3 shadow-[0_-4px_16px_rgba(15,23,42,0.04)] sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        void messaging.send();
      }}
    >
      <label htmlFor={composerId} className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-3">
        <textarea
          id={composerId}
          value={messaging.draft}
          onChange={(event) => messaging.changeDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              if (canSubmit) event.currentTarget.form?.requestSubmit();
            }
          }}
          disabled={messaging.sending}
          maxLength={4000}
          rows={2}
          placeholder="Write a message"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none rounded-[1.375rem] border border-border-strong bg-surface px-4 py-2.5 text-sm leading-6 text-text-primary shadow-sm outline-none placeholder:text-text-muted focus:border-status-info focus:ring-2 focus:ring-status-info focus-visible:ring-offset-0"
        />
        <Button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 shrink-0 rounded-full bg-teal-700 px-5 hover:bg-teal-800"
        >
          {messaging.sending ? "Sending…" : "Send"}
        </Button>
      </div>
      {messaging.sendError ? (
        <p role="alert" className="mt-2 text-sm text-status-danger">
          {messaging.sendError} Your message is still here.
        </p>
      ) : null}
      <p className="mt-2 text-xs text-text-muted">
        Enter to send · Shift+Enter for a new line
      </p>
    </form>
  );
}

function isSameMessageGroup(
  previous: StaffMessage | undefined,
  next: StaffMessage | undefined,
): boolean {
  if (!previous || !next || previous.sender.id !== next.sender.id) return false;
  const previousTime = new Date(previous.createdAt);
  const nextTime = new Date(next.createdAt);
  const gap = nextTime.getTime() - previousTime.getTime();
  return (
    gap >= 0 &&
    gap <= 5 * 60 * 1000 &&
    shortDate.format(previousTime) === shortDate.format(nextTime)
  );
}
