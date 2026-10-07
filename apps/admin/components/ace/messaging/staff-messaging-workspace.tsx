"use client";

import React from "react";
import { useStaffMessaging } from "./use-staff-messaging";

import { ConversationList } from "./conversation-list";
import { ConversationDetail } from "./conversation-detail";

export function StaffMessagingWorkspace({
  currentUserId,
  canSend,
}: {
  currentUserId: string;
  canSend: boolean;
}) {
  const messaging = useStaffMessaging(currentUserId);
  const selected = messaging.conversations.find(
    (conversation) => conversation.id === messaging.selectedId,
  );

  return (
    <main className="mx-auto flex min-w-0 max-w-7xl flex-col gap-5">
      <header className="space-y-1">
        <p className="text-sm font-medium text-accent-strong">
          ACE / Community
        </p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary">
          Messages
        </h1>
        <p className="text-sm leading-6 text-text-muted">
          Private staff conversations for your active site.
        </p>
      </header>

      <div className="grid min-h-[34rem] overflow-hidden rounded-3xl border border-border-subtle bg-surface shadow-sm md:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
        <section
          aria-label="Conversations"
          className={`${messaging.selectedId ? "hidden md:flex" : "flex"} min-w-0 flex-col border-border-subtle md:border-r`}
        >
          <div className="border-b border-border-subtle px-5 py-4">
            <h2 className="font-heading text-lg font-semibold text-text-primary">
              Conversations
            </h2>
          </div>
          <ConversationList messaging={messaging} />
        </section>

        <section
          aria-label={
            selected ? `Conversation with ${selected.title}` : "Message detail"
          }
          className={`${messaging.selectedId ? "flex" : "hidden md:flex"} min-w-0 flex-col bg-shell/70`}
        >
          {selected ? (
            <ConversationDetail
              conversation={selected}
              currentUserId={currentUserId}
              canSend={canSend}
              messaging={messaging}
            />
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div
                className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent-subtle text-2xl text-accent-strong"
                aria-hidden="true"
              >
                ✉
              </div>
              <h2 className="font-heading text-xl font-semibold text-text-primary">
                Choose a conversation
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-text-muted">
                Select a staff thread to read its messages.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
