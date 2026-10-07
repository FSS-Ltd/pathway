"use client";

import React from "react";
import { SquarePen } from "lucide-react";
import { Button } from "@pathway/ui";
import { useStaffMessaging } from "./use-staff-messaging";

import { ConversationList } from "./conversation-list";
import { ConversationDetail } from "./conversation-detail";
import { NewStaffConversation } from "./new-staff-conversation";

export function StaffMessagingWorkspace({
  currentUserId,
  canSend,
  canCreate,
}: {
  currentUserId: string;
  canSend: boolean;
  canCreate: boolean;
}) {
  const messaging = useStaffMessaging(currentUserId);
  const [composing, setComposing] = React.useState(false);
  React.useEffect(
    () => setComposing(false),
    [messaging.siteRevision, canCreate],
  );
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
          className={`${messaging.selectedId && !composing ? "hidden md:flex" : "flex"} min-w-0 flex-col border-border-subtle md:border-r`}
        >
          {composing && canCreate ? (
            <NewStaffConversation
              key={messaging.siteRevision}
              onCancel={() => setComposing(false)}
              onOpen={async (recipient) => {
                const opened =
                  await messaging.startDirectConversation(recipient);
                if (opened) setComposing(false);
                return opened;
              }}
            />
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
                <h2 className="font-heading text-lg font-semibold text-text-primary">
                  Conversations
                </h2>
                {canCreate ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="min-h-11"
                    onClick={() => {
                      messaging.select(null);
                      setComposing(true);
                    }}
                  >
                    <SquarePen className="h-4 w-4" aria-hidden="true" />
                    New message
                  </Button>
                ) : null}
              </div>
              <ConversationList messaging={messaging} />
            </>
          )}
        </section>

        <section
          aria-label={
            selected ? `Conversation with ${selected.title}` : "Message detail"
          }
          className={`${messaging.selectedId && !composing ? "flex" : "hidden md:flex"} min-w-0 flex-col bg-shell/70`}
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
