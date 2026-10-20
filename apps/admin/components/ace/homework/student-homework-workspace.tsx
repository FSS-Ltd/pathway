"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchStudentHomework,
  type StudentHomeworkList,
} from "@/lib/ace-student-homework-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";
import { StudentHomeworkForm } from "./student-homework-form";

type LoadState =
  | { state: "loading" }
  | { state: "error"; message: string }
  | { state: "ready"; data: StudentHomeworkList };

export function StudentHomeworkView({
  siteId,
  status,
}: {
  siteId: string;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<LoadState>({ state: "loading" });
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  const listHeading = React.useRef<HTMLHeadingElement>(null);
  const detailHeading = React.useRef<HTMLHeadingElement>(null);
  const returningToList = React.useRef(false);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    void fetchStudentHomework(siteId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setLoad({ state: "ready", data });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) {
          setLoad({
            state: "error",
            message:
              cause instanceof Error
                ? cause.message
                : "Homework could not be loaded.",
          });
        }
      });
    return () => controller.abort();
  }, [siteId, status, revision]);

  const selected =
    load.state === "ready"
      ? load.data.assignments.find((assignment) => assignment.id === selectedId)
      : undefined;

  React.useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected?.id]);

  React.useEffect(() => {
    if (!selected && returningToList.current) {
      listHeading.current?.focus();
      returningToList.current = false;
    }
  }, [selected]);

  async function refresh() {
    const data = await fetchStudentHomework(siteId);
    setLoad({ state: "ready", data });
  }

  return (
    <main className="space-y-6">
      <header className="space-y-2">
        <Link
          href={`/ace/student/sites/${encodeURIComponent(siteId)}/summary`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to school overview
        </Link>
        {selected ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                returningToList.current = true;
                setSelectedId(null);
              }}
            >
              Back to homework
            </Button>
            <h1
              ref={detailHeading}
              tabIndex={-1}
              className="font-heading text-3xl font-semibold tracking-tight text-text-primary focus:outline-none sm:text-4xl"
            >
              {selected.title}
            </h1>
          </>
        ) : (
          <>
            <h1
              ref={listHeading}
              tabIndex={-1}
              className="font-heading text-3xl font-semibold tracking-tight text-text-primary focus:outline-none sm:text-4xl"
            >
              My homework
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-text-muted">
              Assignments released to your school account.
            </p>
          </>
        )}
      </header>
      {status === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading homework…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see your homework.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/login?returnTo=%2Face%2Ffamily">Sign in</Link>
          </Button>
        </Card>
      ) : load.state === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading homework…
          </p>
        </Card>
      ) : load.state === "error" ? (
        <Card>
          <div role="alert" className="space-y-3">
            <p className="text-sm text-text-primary">{load.message}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLoad({ state: "loading" });
                setRevision((value) => value + 1);
              }}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : selected ? (
        <StudentHomeworkForm
          key={selected.id}
          assignment={selected}
          siteId={siteId}
          enabled={load.data.submissionsEnabled}
          onChanged={refresh}
        />
      ) : load.data.assignments.length === 0 ? (
        <Card title="No homework yet">
          <p className="text-sm text-text-muted">
            Your school has not released homework to your account.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {!load.data.submissionsEnabled ? (
            <Card>
              <p role="status" className="text-sm text-text-muted">
                Homework submissions are not available yet.
              </p>
            </Card>
          ) : null}
          <ul className="space-y-3">
            {load.data.assignments.map((assignment) => (
              <li key={assignment.id}>
                <Card
                  title={assignment.title}
                  description={`Due ${new Date(assignment.dueAt).toLocaleString()}`}
                >
                  <p className="text-sm text-text-muted">
                    {assignment.submission?.status === "SUBMITTED"
                      ? "Submitted"
                      : assignment.submission?.status === "RETURNED"
                        ? "Returned for revision"
                        : assignment.submission?.status === "DRAFT"
                          ? "Draft saved"
                          : "Ready to start"}
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 min-h-11"
                    onClick={() => setSelectedId(assignment.id)}
                  >
                    Open assignment
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}

export function StudentHomeworkWorkspace({ siteId }: { siteId: string }) {
  const { data, status } = useSession();
  return (
    <StudentHomeworkView
      key={`${status}:${data?.user.id ?? ""}:${siteId}`}
      siteId={siteId}
      status={status}
    />
  );
}
