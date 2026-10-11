"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilySummary,
  type FamilySummary,
} from "@/lib/family-summary-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

type LoadState =
  | { state: "loading" }
  | { state: "ready"; summary: FamilySummary }
  | { state: "error"; message: string };

function SectionError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <p role="alert" className="text-sm text-status-danger">
        {message}
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function SummarySections({
  summary,
  onRetry,
}: {
  summary: FamilySummary;
  onRetry: () => void;
}) {
  const { attendance, notices, messages } = summary.sections;
  const site = encodeURIComponent(summary.siteId);
  const child = encodeURIComponent(summary.childId);
  const attendanceHref = `/ace/parent/sites/${site}/children/${child}/attendance`;
  const visible = [attendance, notices, messages].some(
    (section) => section.status !== "unavailable",
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {attendance.status !== "unavailable" ? (
        <Card
          title="Attendance"
          description="Recorded days from the last 30 days. Unmarked days are not absences."
        >
          {attendance.status === "error" ? (
            <SectionError message={attendance.message} onRetry={onRetry} />
          ) : (
            <>
              <p className="text-sm text-text-primary">
                {attendance.data.counts.present} present ·{" "}
                {attendance.data.counts.absent} absent ·{" "}
                {attendance.data.counts.late} late
              </p>
              {attendance.data.items.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">
                  No daily marks recorded in this period.
                </p>
              ) : (
                <p className="mt-2 text-sm text-text-muted">
                  Latest mark: {attendance.data.items[0].date} ·{" "}
                  {attendance.data.items[0].status.toLowerCase()}
                </p>
              )}
              <Button asChild variant="outline" className="mt-4 min-h-11">
                <Link href={attendanceHref}>View attendance</Link>
              </Button>
            </>
          )}
        </Card>
      ) : null}
      {notices.status !== "unavailable" ? (
        <Card
          title="Your school notices"
          description="Across your linked children at this school."
        >
          {notices.status === "error" ? (
            <SectionError message={notices.message} onRetry={onRetry} />
          ) : notices.data.items.length === 0 ? (
            <p className="text-sm text-text-muted">No current notices.</p>
          ) : (
            <ul className="space-y-2">
              {notices.data.items.map((notice) => (
                <li key={notice.id} className="text-sm text-text-primary">
                  {notice.title}
                </li>
              ))}
            </ul>
          )}
          {notices.status === "ready" ? (
            <Button asChild variant="outline" className="mt-4 min-h-11">
              <Link href={`/ace/parent/sites/${site}/notices`}>
                View notices
              </Link>
            </Button>
          ) : null}
        </Card>
      ) : null}
      {messages.status !== "unavailable" ? (
        <Card
          title="Your school conversation"
          description="Messages with the school team may concern any of your linked children."
        >
          {messages.status === "error" ? (
            <SectionError message={messages.message} onRetry={onRetry} />
          ) : messages.data.unreadCount === 0 ? (
            <p className="text-sm text-text-muted">No unread messages.</p>
          ) : (
            <p className="text-sm text-text-primary">
              {messages.data.unreadCount} unread messages
            </p>
          )}
          {messages.status === "ready" ? (
            <Button asChild variant="outline" className="mt-4 min-h-11">
              <Link href={`/ace/parent/sites/${site}/messages`}>
                View messages
              </Link>
            </Button>
          ) : null}
        </Card>
      ) : null}
      {!visible ? (
        <Card>
          <p className="text-sm text-text-muted">
            School services are updating. Try again shortly.
          </p>
        </Card>
      ) : null}
    </div>
  );
}

export function FamilySummaryView({
  siteId,
  childId,
  status,
}: {
  siteId: string;
  childId: string;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<LoadState>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchFamilySummary(siteId, childId, controller.signal)
      .then((summary) => {
        if (!controller.signal.aborted) {
          setLoad({ state: "ready", summary });
        }
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          state: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Family summary could not be loaded. Please try again.",
        });
      });
    return () => controller.abort();
  }, [siteId, childId, revision, status]);

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to family
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {status === "authenticated" && load.state === "ready"
            ? `${load.summary.childName}’s overview`
            : "School overview"}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Current information released by your school for this child.
        </p>
      </header>
      {status === "loading" ||
      (status === "authenticated" && load.state === "loading") ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading school overview…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see this child’s school overview.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/login?returnTo=%2Face%2Ffamily">Sign in</Link>
          </Button>
        </Card>
      ) : load.state === "error" ? (
        <Card>
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <p className="text-sm text-text-primary">{load.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : load.state === "ready" ? (
        <SummarySections
          summary={load.summary}
          onRetry={() => setRevision((value) => value + 1)}
        />
      ) : null}
    </main>
  );
}

export function FamilySummaryWorkspace({
  siteId,
  childId,
}: {
  siteId: string;
  childId: string;
}) {
  const { data, status } = useSession();
  return (
    <FamilySummaryView
      key={`${status}:${data?.user.id ?? ""}:${siteId}:${childId}`}
      siteId={siteId}
      childId={childId}
      status={status}
    />
  );
}
