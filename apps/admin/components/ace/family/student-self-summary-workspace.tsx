"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchStudentSelfSummary,
  type StudentSelfSummary,
} from "@/lib/student-self-summary-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

type LoadState =
  | { state: "loading" }
  | { state: "ready"; summary: StudentSelfSummary }
  | { state: "error"; message: string };

export function StudentSelfSummaryView({
  siteId,
  status,
}: {
  siteId: string;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<LoadState>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchStudentSelfSummary(siteId, controller.signal)
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
              : "School overview could not be loaded. Please try again.",
        });
      });
    return () => controller.abort();
  }, [siteId, revision, status]);

  const currentLoad: LoadState =
    load.state === "ready" && load.summary.siteId !== siteId
      ? { state: "loading" }
      : load;
  const attendance =
    currentLoad.state === "ready"
      ? currentLoad.summary.sections.attendance
      : null;
  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to school links
        </Link>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {status === "authenticated" && currentLoad.state === "ready"
            ? `${currentLoad.summary.childName}’s school overview`
            : "My school overview"}
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          School information currently available to your student account.
        </p>
      </header>
      {status === "loading" ||
      (status === "authenticated" && currentLoad.state === "loading") ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading your school overview…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see your school overview.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/login?returnTo=%2Face%2Ffamily">Sign in</Link>
          </Button>
        </Card>
      ) : currentLoad.state === "error" ? (
        <Card>
          <div role="alert" className="space-y-3">
            <p className="text-sm text-text-primary">{currentLoad.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : attendance?.status === "unavailable" ? (
        <Card title="No updates yet">
          <p className="text-sm text-text-muted">
            Your school overview has no released updates right now.
          </p>
        </Card>
      ) : attendance?.status === "error" ? (
        <Card title="Attendance">
          <div role="alert" className="space-y-3">
            <p className="text-sm text-status-danger">{attendance.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : attendance?.status === "ready" ? (
        <Card
          title="Attendance"
          description="Recorded days from the last 30 days. Unmarked days are not absences."
        >
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
            <Link
              href={`/ace/student/sites/${encodeURIComponent(siteId)}/attendance`}
            >
              View attendance
            </Link>
          </Button>
        </Card>
      ) : null}
    </main>
  );
}

export function StudentSelfSummaryWorkspace({ siteId }: { siteId: string }) {
  const { status } = useSession();
  return <StudentSelfSummaryView siteId={siteId} status={status} />;
}
