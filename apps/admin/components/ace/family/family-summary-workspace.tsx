"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilyChildOverview,
  fetchFamilySummary,
  type FamilySummary,
} from "@/lib/family-summary-api";
import {
  type StudentOverviewResponse,
  type StudentOverviewTab,
} from "@/lib/child-overview-api";
import { ChildOverviewPresentation } from "@/components/children/child-overview-presentation";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

type LoadState<T> =
  | { state: "loading" }
  | { state: "ready"; data: T }
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
  const { notices, messages } = summary.sections;
  const site = encodeURIComponent(summary.siteId);
  const visible = [notices, messages].some(
    (section) => section.status !== "unavailable",
  );

  return (
    <div className="grid gap-4 lg:grid-cols-2">
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

function SchoolUpdates({
  load,
  onRetry,
}: {
  load: LoadState<FamilySummary>;
  onRetry: () => void;
}) {
  return (
    <section aria-label="School updates" className="space-y-3">
      <h2 className="font-heading text-xl font-semibold text-text-primary">
        School updates
      </h2>
      {load.state === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading school updates…
          </p>
        </Card>
      ) : load.state === "error" ? (
        <Card>
          <SectionError message={load.message} onRetry={onRetry} />
        </Card>
      ) : (
        <SummarySections summary={load.data} onRetry={onRetry} />
      )}
    </section>
  );
}

const tabLabels: Record<StudentOverviewTab, string> = {
  overview: "Overview",
  attendance: "Attendance",
  academics: "Academic results",
  contacts: "Contacts",
  registration: "Registration",
  pace: "PACE",
  behaviour: "Behaviour",
  discipline: "Discipline",
  merits: "Merits",
  notes: "Notes",
};

function ChildOverview({
  overview,
  activeTab,
  onSelectTab,
  onRetry,
  includeAceServices,
  siteId,
  childId,
}: {
  overview: StudentOverviewResponse;
  activeTab: StudentOverviewTab;
  onSelectTab: (tab: StudentOverviewTab) => void;
  onRetry: () => void;
  includeAceServices: boolean;
  siteId: string;
  childId: string;
}) {
  const { identity } = overview;
  const childName =
    `${identity.preferredName || identity.firstName} ${identity.lastName}`.trim();
  const statusLabel =
    identity.status === "enrolled"
      ? "Enrolled"
      : identity.status === "not-enrolled"
        ? "Not enrolled"
        : "Status unconfirmed";
  const selectedTab = overview.tabs.includes(activeTab)
    ? activeTab
    : "overview";
  return (
    <>
      <header className="space-y-2">
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          {childName}’s overview
        </h1>
        <p className="text-sm text-text-muted">
          {[identity.yearGroup, identity.groupName]
            .filter((value): value is string => Boolean(value))
            .join(" · ") || "School profile"}
          {` · ${statusLabel}`}
        </p>
      </header>
      <div
        role="group"
        aria-label="Child overview sections"
        className="flex flex-wrap gap-2"
      >
        {overview.tabs.map((tab) => (
          <Button
            key={tab}
            type="button"
            variant={selectedTab === tab ? "primary" : "outline"}
            aria-pressed={selectedTab === tab}
            onClick={() => onSelectTab(tab)}
            className="min-h-11"
          >
            {tabLabels[tab]}
          </Button>
        ))}
      </div>
      <ChildOverviewPresentation
        overview={overview}
        activeTab={selectedTab}
        onSelectTab={onSelectTab}
        onRetry={onRetry}
      />
      {includeAceServices && selectedTab === "attendance" ? (
        <Button asChild variant="outline" className="min-h-11">
          <Link
            href={`/ace/parent/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}/attendance`}
          >
            View daily attendance
          </Link>
        </Button>
      ) : null}
    </>
  );
}

export function FamilySummaryView({
  siteId,
  childId,
  status,
  includeAceServices = true,
}: {
  siteId: string;
  childId: string;
  status: SessionStatus;
  includeAceServices?: boolean;
}) {
  const [overview, setOverview] = React.useState<
    LoadState<StudentOverviewResponse>
  >({ state: "loading" });
  const [services, setServices] = React.useState<LoadState<FamilySummary>>({
    state: "loading",
  });
  const [activeTab, setActiveTab] =
    React.useState<StudentOverviewTab>("overview");
  const [revision, setRevision] = React.useState(0);
  const retry = () => setRevision((value) => value + 1);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setOverview({ state: "loading" });
    void fetchFamilyChildOverview(siteId, childId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setOverview({ state: "ready", data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setOverview({
          state: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "Family overview could not be loaded. Please try again.",
        });
      });
    return () => controller.abort();
  }, [siteId, childId, revision, status]);

  React.useEffect(() => {
    if (status !== "authenticated" || !includeAceServices) return;
    const controller = new AbortController();
    setServices({ state: "loading" });
    void fetchFamilySummary(siteId, childId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setServices({ state: "ready", data });
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setServices({
          state: "error",
          message:
            cause instanceof Error
              ? cause.message
              : "School services could not be loaded. Please try again.",
        });
      });
    return () => controller.abort();
  }, [siteId, childId, revision, status, includeAceServices]);

  return (
    <main className="space-y-6">
      <Link
        href="/ace/family"
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
      >
        Back to family
      </Link>
      {status === "loading" ||
      (status === "authenticated" && overview.state === "loading") ? (
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
      ) : overview.state === "error" ? (
        <>
          <Card>
            <SectionError message={overview.message} onRetry={retry} />
          </Card>
          {includeAceServices ? (
            <SchoolUpdates load={services} onRetry={retry} />
          ) : null}
        </>
      ) : overview.state === "ready" ? (
        <>
          <ChildOverview
            overview={overview.data}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onRetry={retry}
            includeAceServices={includeAceServices}
            siteId={siteId}
            childId={childId}
          />
          {includeAceServices &&
          (activeTab === "overview" ||
            !overview.data.tabs.includes(activeTab)) ? (
            <SchoolUpdates load={services} onRetry={retry} />
          ) : null}
        </>
      ) : null}
    </main>
  );
}

export function FamilySummaryWorkspace({
  siteId,
  childId,
  includeAceServices = true,
}: {
  siteId: string;
  childId: string;
  includeAceServices?: boolean;
}) {
  const { data, status } = useSession();
  return (
    <FamilySummaryView
      key={`${status}:${data?.user.id ?? ""}:${siteId}:${childId}`}
      siteId={siteId}
      childId={childId}
      status={status}
      includeAceServices={includeAceServices}
    />
  );
}
