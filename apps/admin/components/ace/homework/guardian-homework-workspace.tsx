"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchGuardianHomework,
  type GuardianHomeworkItem,
} from "@/lib/ace-guardian-homework-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

type LoadState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; items: GuardianHomeworkItem[] };

const statusLabels: Record<GuardianHomeworkItem["status"], string> = {
  NOT_STARTED: "Not started",
  DRAFT: "Draft in progress",
  SUBMITTED: "Submitted",
  RETURNED: "Returned for changes",
  COMPLETED: "Completed",
};

export function GuardianHomeworkView({
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
    void fetchGuardianHomework(siteId, childId, controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setLoad({ state: "ready", items });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({
          state: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Homework could not be loaded. Please try again.",
        });
      });
    return () => controller.abort();
  }, [siteId, childId, status, revision]);

  const items = load.state === "ready" ? load.items : [];
  const returnTo = `/ace/parent/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/homework`;
  return (
    <main className="min-w-0 space-y-6">
      <header className="space-y-2">
        <Link
          href={`/ace/parent/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/summary`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to child overview
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Homework
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Published assignments and feedback your school has released to you.
        </p>
      </header>
      {status === "loading" ||
      (status === "authenticated" && load.state === "loading") ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading homework…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see homework linked to your family account.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href={`/login?returnTo=${encodeURIComponent(returnTo)}`}>
              Sign in
            </Link>
          </Button>
        </Card>
      ) : load.state === "error" ? (
        <Card>
          <p role="alert" className="text-sm text-status-danger">
            {load.message}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-4 min-h-11"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </Button>
        </Card>
      ) : items.length === 0 ? (
        <Card title="No homework yet">
          <p className="text-sm text-text-muted">
            Your school has not published homework for this child.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card
                title={item.title}
                description={`Due ${new Date(item.dueAt).toLocaleString()}`}
              >
                <p className="text-sm font-medium text-text-primary">
                  {statusLabels[item.status]}
                </p>
                {item.feedbackReleasedAt && item.feedback ? (
                  <div className="mt-3 border-t border-border-subtle pt-3">
                    <p className="text-sm font-medium text-text-primary">
                      Released feedback
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">
                      {item.feedback}
                    </p>
                  </div>
                ) : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function GuardianHomeworkWorkspace({
  siteId,
  childId,
}: {
  siteId: string;
  childId: string;
}) {
  const { data, status } = useSession();
  return (
    <GuardianHomeworkView
      key={`${status}:${data?.user.id ?? ""}:${siteId}:${childId}`}
      siteId={siteId}
      childId={childId}
      status={status}
    />
  );
}
