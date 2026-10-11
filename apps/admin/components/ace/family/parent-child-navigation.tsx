"use client";

import React from "react";
import Link from "next/link";
import { Button } from "@pathway/ui";
import {
  fetchFamilyContexts,
  type FamilyContext,
  type FamilySection,
} from "@/lib/family-contexts-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

type ChildSection = Extract<
  FamilySection,
  "ace-summary" | "attendance" | "sessions" | "subject-timetable"
>;

const sectionRoutes: Record<ChildSection, string> = {
  "ace-summary": "summary",
  attendance: "attendance",
  sessions: "timetable",
  "subject-timetable": "subject-timetable",
};

const sectionLabels: Record<ChildSection, string> = {
  "ace-summary": "overview",
  attendance: "attendance",
  sessions: "sessions",
  "subject-timetable": "subject timetable",
};

export function childSectionForRoute(
  route: string | null,
): ChildSection | null {
  switch (route) {
    case "summary":
      return "ace-summary";
    case "attendance":
      return "attendance";
    case "timetable":
      return "sessions";
    case "subject-timetable":
      return "subject-timetable";
    default:
      return null;
  }
}

function childHref(context: FamilyContext, section: ChildSection): string {
  return `/ace/parent/sites/${encodeURIComponent(context.siteId)}/children/${encodeURIComponent(context.childId)}/${sectionRoutes[section]}`;
}

type LoadState =
  | { state: "loading" }
  | { state: "ready"; contexts: FamilyContext[] }
  | { state: "error" };

export function ParentChildNavigationView({
  siteId,
  childId,
  section,
  status,
}: {
  siteId: string;
  childId: string;
  section: ChildSection;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<LoadState>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchFamilyContexts(controller.signal)
      .then((contexts) => {
        if (!controller.signal.aborted) setLoad({ state: "ready", contexts });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [status, siteId, childId, section, revision]);

  if (status !== "authenticated") return null;

  const linked =
    load.state === "ready"
      ? load.contexts.filter(
          (context) =>
            context.kind === "parent" &&
            context.siteId === siteId &&
            context.sections.includes(section),
        )
      : [];
  const current = linked.find((context) => context.childId === childId);

  return (
    <section
      aria-label="Child and school"
      className="mb-6 rounded-xl border border-border-subtle bg-surface px-4 py-4 shadow-card sm:px-5"
    >
      {load.state === "loading" ? (
        <p role="status" className="text-sm text-text-muted">
          Checking your child link…
        </p>
      ) : load.state === "error" ? (
        <div role="alert" className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-text-primary">
            Child links could not be loaded. You can still use this page.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </Button>
        </div>
      ) : !current ? (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-text-primary">
            This child is not linked to your account for this school service.
          </p>
          <Link
            href="/ace/family"
            className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
          >
            Return to your family
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Viewing {sectionLabels[section]}
          </p>
          <p className="mt-1 font-heading text-lg font-semibold text-text-primary">
            {current.childName}{" "}
            <span className="ml-2 font-sans text-sm font-normal text-text-muted">
              at {current.siteName}
            </span>
          </p>
          {linked.length > 1 ? (
            <nav
              aria-label={`Choose child for ${sectionLabels[section]}`}
              className="mt-3"
            >
              <p className="mb-2 text-sm text-text-muted">Switch child</p>
              <ul className="flex flex-wrap gap-2">
                {linked.map((context) => (
                  <li key={context.childId}>
                    <Link
                      href={childHref(context, section)}
                      aria-current={
                        context.childId === childId ? "page" : undefined
                      }
                      className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong ${
                        context.childId === childId
                          ? "border-accent-strong bg-accent-subtle text-text-primary"
                          : "border-border-subtle bg-surface text-text-primary hover:border-accent-strong"
                      }`}
                    >
                      {context.childName}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </>
      )}
    </section>
  );
}

export function ParentChildNavigation({
  siteId,
  childId,
  section,
}: {
  siteId: string;
  childId: string;
  section: ChildSection;
}) {
  const { data, status } = useSession();
  return (
    <ParentChildNavigationView
      key={`${status}:${data?.user.id ?? ""}:${siteId}:${childId}:${section}`}
      siteId={siteId}
      childId={childId}
      section={section}
      status={status}
    />
  );
}
