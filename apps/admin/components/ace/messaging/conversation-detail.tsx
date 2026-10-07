"use client";

import * as React from "react";
import { Button } from "@pathway/ui";
import type { StaffConversation, StaffMessage } from "@/lib/ace-messaging-api";
import { useStaffMessaging } from "./use-staff-messaging";

type MessagingState = ReturnType<typeof useStaffMessaging>;
const shortTime = new Intl.DateTimeFormat("en-GB", { timeStyle: "short" });
const shortDate = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

export function ConversationDetail({
  conversation,
  currentUserId,
  canSend,
  messaging,
}: {
  conversation: StaffConversation;
  currentUserId: string;
  canSend: boolean;
  messaging: MessagingState;
}) {
  const endRef = React.useRef<HTMLDivElement>(null);
  const latestSequence = messaging.messages.at(-1)?.sequence;
  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end", behavior: "auto" });
  }, [conversation.id, latestSequence]);

  return (
    <>
      <header className="flex items-center gap-3 border-b border-border-subtle bg-surface/95 px-4 py-3 sm:px-6">
        <button
          type="button"
          onClick={() => messaging.select(null)}
          className="min-h-11 rounded-lg px-2 text-sm font-medium text-accent-strong md:hidden"
          aria-label="Back to conversations"
        >
          ‹ Back
        </button>
        <div className="min-w-0">
          <h2 className="truncate font-heading text-lg font-semibold text-text-primary">
            {conversation.title}
          </h2>
          <p className="text-xs text-text-muted">
            {conversation.kind === "STAFF_ROOM"
              ? "Staff room"
              : "Direct staff conversation"}
          </p>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8"
        aria-label="Messages"
      >
        {messaging.nextBefore ? (
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
        {messaging.threadError ? (
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
        {!messaging.threadLoading &&
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
        <MessageList
          messages={messaging.messages}
          currentUserId={currentUserId}
        />
        <div ref={endRef} />
      </div>

      <MessageComposer canSend={canSend} messaging={messaging} />
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
  let previousDate = "";
  const latestOutgoingId = messages.reduce<string | null>(
    (latest, message) =>
      message.sender.id === currentUserId &&
      typeof message.recipientRead === "boolean"
        ? message.id
        : latest,
    null,
  );
  return (
    <ol className="space-y-3" aria-live="polite" aria-relevant="additions text">
      {messages.map((message) => {
        const date = shortDate.format(new Date(message.createdAt));
        const showDate = date !== previousDate;
        previousDate = date;
        const outgoing = message.sender.id === currentUserId;
        return (
          <li key={message.id}>
            {showDate ? (
              <p className="mb-4 pt-2 text-center text-xs font-medium text-text-muted">
                {date}
              </p>
            ) : null}
            <div
              className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
            >
              <div className="max-w-[min(85%,34rem)]">
                <div
                  className={`rounded-2xl px-4 py-2.5 shadow-sm ${outgoing ? "rounded-br-md bg-accent-strong text-white" : "rounded-bl-md border border-border-subtle bg-surface text-text-primary"}`}
                >
                  {!outgoing ? (
                    <p className="mb-1 text-xs font-semibold opacity-75">
                      {message.sender.displayName}
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap break-words text-sm leading-6">
                    {outgoing ? <span className="sr-only">You: </span> : null}
                    {message.body}
                  </p>
                  <time
                    dateTime={message.createdAt}
                    className={`mt-1 block text-right text-xs ${outgoing ? "text-white/80" : "text-text-muted"}`}
                  >
                    {shortTime.format(new Date(message.createdAt))}
                  </time>
                </div>
                {message.id === latestOutgoingId ? (
                  <p className="mt-1 text-right text-xs text-text-muted">
                    {message.recipientRead ? "Read" : "Sent"}
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
}: {
  canSend: boolean;
  messaging: MessagingState;
}) {
  if (!canSend) {
    return (
      <p className="border-t border-border-subtle bg-surface px-5 py-4 text-sm text-text-muted">
        You can read this conversation, but you do not have permission to send
        messages.
      </p>
    );
  }
  const canSubmit =
    messaging.draft.trim().length > 0 &&
    messaging.draft.trim().length <= 4000 &&
    !messaging.sending;
  return (
    <form
      className="border-t border-border-subtle bg-surface px-4 py-3 sm:px-6"
      onSubmit={(event) => {
        event.preventDefault();
        void messaging.send();
      }}
    >
      <label htmlFor="staff-message-draft" className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-3 rounded-2xl border border-border-strong bg-shell p-2 focus-within:ring-2 focus-within:ring-status-info">
        <textarea
          id="staff-message-draft"
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
          className="max-h-40 min-h-11 flex-1 resize-y border-0 bg-transparent px-2 py-2 text-sm leading-6 text-text-primary outline-none placeholder:text-text-muted focus:ring-0"
        />
        <Button
          type="submit"
          disabled={!canSubmit}
          className="min-h-11 shrink-0 rounded-xl px-5"
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
