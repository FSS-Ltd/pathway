"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilyContexts,
  type FamilyContext,
} from "@/lib/family-contexts-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

function contextHref(context: FamilyContext): string {
  const site = encodeURIComponent(context.siteId);
  return context.kind === "student"
    ? `/ace/student/sites/${site}/attendance`
    : `/ace/parent/sites/${site}/children/${encodeURIComponent(context.childId)}/attendance`;
}

function ContextList({
  title,
  items,
}: {
  title: string;
  items: FamilyContext[];
}) {
  if (items.length === 0) return null;
  return (
    <section aria-label={title} className="space-y-3">
      <h2 className="font-heading text-xl font-semibold text-text-primary">
        {title}
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((context) => (
          <li key={`${context.kind}:${context.siteId}:${context.childId}`}>
            <Link
              href={contextHref(context)}
              className="group flex min-h-24 items-center justify-between gap-4 rounded-xl border border-border-subtle bg-surface px-5 py-4 shadow-card transition-colors hover:border-accent-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
            >
              <span className="min-w-0 space-y-1">
                <span className="block truncate font-heading text-lg font-semibold text-text-primary">
                  {context.childName}
                </span>
                <span className="block truncate text-sm text-text-muted">
                  {context.siteName}
                </span>
                <span className="block text-sm font-medium text-accent-strong">
                  View attendance
                </span>
              </span>
              <ChevronRight
                aria-hidden="true"
                className="h-5 w-5 shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FamilyLandingView({ status }: { status: SessionStatus }) {
  const [contexts, setContexts] = React.useState<FamilyContext[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setContexts(null);
    void fetchFamilyContexts(controller.signal)
      .then(setContexts)
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error
            ? cause.message
            : "Family access could not be loaded. Please try again.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [status, revision]);

  const parentContexts =
    contexts?.filter((item) => item.kind === "parent") ?? [];
  const studentContexts =
    contexts?.filter((item) => item.kind === "student") ?? [];
  return (
    <main className="space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent-strong">ACE / Family</p>
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
          Your family
        </h1>
        <p className="max-w-2xl text-base leading-7 text-text-muted">
          Choose a linked child or your own student record to see daily
          attendance at that school.
        </p>
      </header>

      {status === "loading" || (status === "authenticated" && loading) ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading your school links…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see the children and school sites linked to your account.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/login?returnTo=%2Face%2Ffamily">Sign in</Link>
          </Button>
        </Card>
      ) : error ? (
        <Card>
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-4"
          >
            <p className="text-sm text-text-primary">{error}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : contexts?.length === 0 ? (
        <Card title="No school links yet">
          <p className="text-sm leading-6 text-text-muted">
            There are no active family or student links for this account. Ask
            your school to check your invitation or access link.
          </p>
        </Card>
      ) : (
        <div className="space-y-8">
          <ContextList title="Children linked to you" items={parentContexts} />
          <ContextList title="Your student access" items={studentContexts} />
        </div>
      )}
    </main>
  );
}

export function FamilyLanding() {
  const { status } = useSession();
  return <FamilyLandingView status={status} />;
}
