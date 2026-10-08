"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import { searchParentResponders } from "@/lib/ace-parent-messaging-api";
import { useSession } from "@/lib/use-session-compat";
import { ConversationDetail } from "./conversation-detail";
import { RecipientPicker } from "./recipient-picker";
import { useParentMessaging } from "./use-parent-messaging";

const responderCopy = {
  title: "Choose a school team member",
  label: "To: Approved school responder",
  placeholder: "Search your school team",
  hint: "Only current approved responders at this school appear.",
  intro: "No approved school responders are available yet.",
  noMatch: "No approved responders match this search at your school.",
  searchError: "Unable to load school responders. Try again.",
  openError: "Unable to start your school conversation. Try again.",
};

export function ParentMessagesView({
  siteId,
  currentUserId,
}: {
  siteId: string;
  currentUserId: string;
}) {
  const messaging = useParentMessaging(siteId, currentUserId);
  const searchRecipients = React.useCallback(
    (search: string, signal?: AbortSignal) =>
      searchParentResponders(siteId, search, signal),
    [siteId],
  );

  return (
    <main className="space-y-5">
      <header className="space-y-2">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          ‹ Your family
        </Link>
        <p className="text-sm font-medium text-accent-strong">ACE / Family</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          School messages
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Talk privately with an approved member of your school team. Your
          conversation stays with this school site.
        </p>
      </header>

      {messaging.listLoading ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading your school conversation…
          </p>
        </Card>
      ) : messaging.listError ? (
        <Card>
          <div role="alert" className="space-y-3">
            <p className="text-sm text-text-primary">{messaging.listError}</p>
            <p className="text-sm text-text-muted">
              Your school link or messaging access may have changed.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={messaging.retryList}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : messaging.conversation ? (
        <div className="flex h-[min(75dvh,50rem)] min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-border-subtle bg-surface shadow-card">
          <ConversationDetail
            conversation={messaging.conversation}
            currentUserId={currentUserId}
            canSend
            messaging={messaging}
            composerId="parent-message-draft"
          />
        </div>
      ) : (
        <div className="flex min-h-[28rem] flex-col overflow-hidden rounded-3xl border border-border-subtle bg-surface shadow-card">
          <RecipientPicker
            searchId="parent-responder-search"
            searchRecipients={searchRecipients}
            minSearchLength={0}
            copy={responderCopy}
            onOpen={(recipient) => messaging.open(recipient.id)}
          />
        </div>
      )}
    </main>
  );
}

export function ParentMessagingWorkspace({ siteId }: { siteId: string }) {
  const { data, status } = useSession();
  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading your session…
      </p>
    );
  }
  if (status !== "authenticated" || !data?.user.id) {
    return (
      <Card title="Sign in to continue">
        <p className="text-sm text-text-muted">
          Sign in to see school messages linked to your family account.
        </p>
        <Button asChild className="mt-4 min-h-11">
          <Link
            href={`/login?returnTo=${encodeURIComponent(`/ace/parent/sites/${encodeURIComponent(siteId)}/messages`)}`}
          >
            Sign in
          </Link>
        </Button>
      </Card>
    );
  }
  return (
    <ParentMessagesView
      key={`${siteId}:${data.user.id}`}
      siteId={siteId}
      currentUserId={data.user.id}
    />
  );
}
