"use client";

import React from "react";
import { MessagesSquare, SquarePen } from "lucide-react";
import { Button } from "@pathway/ui";
import { useStaffMessaging } from "./use-staff-messaging";

import { ConversationList } from "./conversation-list";
import { ConversationDetail } from "./conversation-detail";
import { NewStaffConversation } from "./new-staff-conversation";

export function StaffMessagingWorkspace({
  currentUserId,
  canSend,
  canCreate,
  familyMessagingEnabled,
}: {
  currentUserId: string;
  canSend: boolean;
  canCreate: boolean;
  familyMessagingEnabled: boolean;
}) {
  const [channel, setChannel] = React.useState<"staff" | "school-team">(
    "staff",
  );
  const selectedChannel = familyMessagingEnabled ? channel : "staff";

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
          Private staff conversations, your site staff room, and family
          messages.
        </p>
      </header>
      <div
        role="group"
        aria-label="Message channels"
        className="inline-flex w-fit rounded-2xl border border-border-subtle bg-surface p-1 shadow-sm"
      >
        {(["staff", "school-team"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={selectedChannel === option}
            disabled={option === "school-team" && !familyMessagingEnabled}
            onClick={() => setChannel(option)}
            className={`min-h-11 rounded-xl px-4 text-sm font-semibold transition-colors motion-reduce:transition-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong disabled:cursor-not-allowed ${selectedChannel === option ? "bg-accent-subtle text-accent-strong" : "text-text-muted hover:text-text-primary"}`}
          >
            {option === "staff" ? "Staff" : "School Team"}
          </button>
        ))}
      </div>
      {!familyMessagingEnabled ? (
        <p className="rounded-xl border border-border-subtle bg-muted px-4 py-3 text-sm leading-6 text-text-muted">
          School Team messaging will be available when the parent portal is
          enabled. Guardian access must be approved before a parent can message
          staff.
        </p>
      ) : null}
      <StaffConversationPane
        key={selectedChannel}
        channel={selectedChannel}
        currentUserId={currentUserId}
        canSend={canSend}
        canCreate={canCreate}
      />
    </main>
  );
}

function StaffConversationPane({
  channel,
  currentUserId,
  canSend,
  canCreate,
}: {
  channel: "staff" | "school-team";
  currentUserId: string;
  canSend: boolean;
  canCreate: boolean;
}) {
  const schoolTeam = channel === "school-team";
  const messaging = useStaffMessaging(currentUserId, channel);
  const [composing, setComposing] = React.useState(false);
  React.useEffect(
    () => setComposing(false),
    [messaging.siteRevision, canCreate],
  );
  const selected = messaging.conversations.find(
    (conversation) => conversation.id === messaging.selectedId,
  );

  return (
    <>
      <div className="grid h-[min(75dvh,50rem)] min-h-[28rem] overflow-hidden rounded-3xl border border-border-subtle bg-surface shadow-card md:grid-cols-[minmax(17rem,21rem)_minmax(0,1fr)]">
        <section
          aria-label="Conversations"
          className={`${messaging.selectedId && !composing ? "hidden md:flex" : "flex"} min-h-0 min-w-0 flex-col border-border-subtle md:border-r`}
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
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-4">
                <h2 className="font-heading text-lg font-semibold text-text-primary">
                  {schoolTeam ? "School Team" : "Conversations"}
                </h2>
                {!schoolTeam && canCreate ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      disabled={messaging.roomOpening}
                      onClick={() => void messaging.startStaffRoom()}
                    >
                      <MessagesSquare className="h-4 w-4" aria-hidden="true" />
                      {messaging.roomOpening ? "Opening…" : "Staff room"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="min-h-11"
                      disabled={messaging.roomOpening}
                      onClick={() => {
                        messaging.select(null);
                        setComposing(true);
                      }}
                    >
                      <SquarePen className="h-4 w-4" aria-hidden="true" />
                      New message
                    </Button>
                  </div>
                ) : null}
              </div>
              {messaging.roomError ? (
                <p
                  role="alert"
                  className="px-5 py-3 text-sm text-status-danger"
                >
                  {messaging.roomError}
                </p>
              ) : null}
              <ConversationList messaging={messaging} schoolTeam={schoolTeam} />
            </>
          )}
        </section>

        <section
          aria-label={
            selected ? `Conversation with ${selected.title}` : "Message detail"
          }
          className={`${messaging.selectedId && !composing ? "flex" : "hidden md:flex"} min-h-0 min-w-0 flex-col bg-shell/70`}
        >
          {selected ? (
            <ConversationDetail
              conversation={selected}
              currentUserId={currentUserId}
              canSend={canSend}
              messaging={messaging}
              onBack={() => messaging.select(null)}
              contextLabel={schoolTeam ? "Parent conversation" : undefined}
              composerId={
                schoolTeam ? "school-team-message-draft" : "staff-message-draft"
              }
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
                {schoolTeam
                  ? "Select a family thread to read its messages."
                  : "Select a staff thread to read its messages."}
              </p>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
