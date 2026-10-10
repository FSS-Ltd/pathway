"use client";

import * as React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import { NoticeInboxView } from "@/components/notices/staff-notice-inbox";
import {
  useNoticeInbox,
  type NoticeSource,
} from "@/components/notices/use-staff-notices";
import {
  acknowledgeParentNotice,
  fetchParentNotice,
  fetchParentNotices,
  markParentNoticeRead,
} from "@/lib/ace-notice-api";
import { useSession } from "@/lib/use-session-compat";

export function ParentNoticesView({ siteId }: { siteId: string }) {
  const source = React.useMemo<NoticeSource>(
    () => ({
      label: "school notices",
      accessError: "Your school link or notice access may have changed.",
      list: (cursor, signal) => fetchParentNotices(siteId, cursor, signal),
      get: (id, signal) => fetchParentNotice(siteId, id, signal),
      markRead: (id) => markParentNoticeRead(siteId, id),
      acknowledge: (id) => acknowledgeParentNotice(siteId, id),
    }),
    [siteId],
  );
  const inbox = useNoticeInbox(source);

  return (
    <div className="space-y-5">
      <Link
        href="/ace/family"
        className="inline-flex min-h-11 items-center rounded-lg text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      >
        ‹ Your family
      </Link>
      <NoticeInboxView inbox={inbox} reader="parent" />
    </div>
  );
}

export function ParentNoticeInbox({ siteId }: { siteId: string }) {
  const { data, status } = useSession();
  if (status === "loading") {
    return (
      <p role="status" className="text-sm text-text-muted">
        Loading your session…
      </p>
    );
  }
  if (status !== "authenticated" || !data?.user.id) {
    const returnTo = `/ace/parent/sites/${encodeURIComponent(siteId)}/notices`;
    return (
      <Card title="Sign in to continue">
        <p className="text-sm text-text-muted">
          Sign in to see school notices linked to your family account.
        </p>
        <Button asChild className="mt-4 min-h-11">
          <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
            Sign in
          </Link>
        </Button>
      </Card>
    );
  }
  return (
    <ParentNoticesView key={`${siteId}:${data.user.id}`} siteId={siteId} />
  );
}
