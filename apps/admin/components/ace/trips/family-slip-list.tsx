"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import { fetchFamilySlips, type FamilySlip } from "@/lib/ace-trip-slips-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; items: FamilySlip[]; nextCursor: string | null };

export function FamilySlipListView({
  siteId,
  childId,
  status,
}: {
  siteId: string;
  childId: string;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<Load>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const heading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchFamilySlips(siteId, childId, controller.signal)
      .then((page) => {
        if (!controller.signal.aborted) setLoad({ state: "ready", ...page });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [siteId, childId, status, revision]);

  async function loadMore() {
    if (load.state !== "ready" || !load.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const page = await fetchFamilySlips(
        siteId,
        childId,
        undefined,
        load.nextCursor,
      );
      setLoad({
        state: "ready",
        items: [...load.items, ...page.items],
        nextCursor: page.nextCursor,
      });
      heading.current?.focus();
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const base = `/ace/parent/sites/${encodeURIComponent(siteId)}/children/${encodeURIComponent(childId)}`;
  return (
    <main className="min-w-0 space-y-6">
      <header className="space-y-2">
        <Link
          href={`${base}/summary`}
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to child overview
        </Link>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-heading text-3xl font-semibold tracking-tight text-text-primary focus:outline-none sm:text-4xl"
        >
          Trip permission slips
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Read the school’s current wording for each trip before responding.
        </p>
      </header>
      {status === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading permission slips…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <Button asChild className="mt-4 min-h-11">
            <Link
              href={`/login?returnTo=${encodeURIComponent(`${base}/slips`)}`}
            >
              Sign in
            </Link>
          </Button>
        </Card>
      ) : load.state === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading permission slips…
          </p>
        </Card>
      ) : load.state === "error" ? (
        <Card title="Permission slips could not be loaded">
          <p role="alert" className="text-sm text-text-muted">
            Check your connection and try again.
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
      ) : load.items.length === 0 && !load.nextCursor ? (
        <Card title="No permission slips yet">
          <p className="text-sm text-text-muted">
            Your school has not published a trip slip for this child.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          <ul className="space-y-3">
            {load.items.map((slip) => (
              <li key={slip.id}>
                <Card title={slip.title} description={slip.tripTitle}>
                  <p className="text-sm text-text-muted">
                    {slip.cancelled
                      ? "Trip cancelled"
                      : `Respond by ${new Date(slip.deadlineAt).toLocaleDateString()}`}
                  </p>
                  <Button asChild variant="outline" className="mt-3 min-h-11">
                    <Link href={`${base}/slips/${encodeURIComponent(slip.id)}`}>
                      Read slip
                    </Link>
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
          {load.nextCursor ? (
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? "Loading…" : "Load more slips"}
            </Button>
          ) : null}
          {moreError ? (
            <p role="alert" className="text-sm text-text-primary">
              More slips could not be loaded. Try again.
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}

export function FamilySlipList({
  siteId,
  childId,
}: {
  siteId: string;
  childId: string;
}) {
  const { data, status } = useSession();
  return (
    <FamilySlipListView
      key={`${siteId}:${childId}:${data?.user?.id ?? ""}`}
      siteId={siteId}
      childId={childId}
      status={status}
    />
  );
}
