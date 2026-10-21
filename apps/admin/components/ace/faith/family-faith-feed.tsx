"use client";

import React from "react";
import Link from "next/link";
import { Button, Card } from "@pathway/ui";
import {
  fetchFamilyFaithFeed,
  type FamilyFaithFeed as Feed,
  type FamilyFaithItem,
} from "@/lib/ace-faith-api";
import { useSession, type SessionStatus } from "@/lib/use-session-compat";
import { FamilyFaithDetail } from "./family-faith-detail";

type Load =
  | { state: "loading" }
  | { state: "error" }
  | { state: "ready"; feed: Feed };

export function FamilyFaithFeedView({
  siteId,
  childId,
  status,
}: {
  siteId: string;
  childId?: string;
  status: SessionStatus;
}) {
  const [load, setLoad] = React.useState<Load>({ state: "loading" });
  const [revision, setRevision] = React.useState(0);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState(false);
  const [moreError, setMoreError] = React.useState(false);
  const listHeading = React.useRef<HTMLHeadingElement>(null);
  const detailHeading = React.useRef<HTMLHeadingElement>(null);
  const returning = React.useRef(false);

  React.useEffect(() => {
    if (status !== "authenticated") return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    void fetchFamilyFaithFeed(siteId, childId, undefined, controller.signal)
      .then((feed) => {
        if (!controller.signal.aborted) setLoad({ state: "ready", feed });
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoad({ state: "error" });
      });
    return () => controller.abort();
  }, [siteId, childId, status, revision]);

  const feed = load.state === "ready" ? load.feed : null;
  const selected: FamilyFaithItem | undefined = feed?.items.find(
    (item) => item.id === selectedId,
  );
  React.useEffect(() => {
    if (selected) detailHeading.current?.focus();
  }, [selected]);
  React.useEffect(() => {
    if (!selected && returning.current) {
      listHeading.current?.focus();
      returning.current = false;
    }
  }, [selected]);

  async function loadMore() {
    if (!feed?.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreError(false);
    try {
      const next = await fetchFamilyFaithFeed(siteId, childId, feed.nextCursor);
      setLoad({
        state: "ready",
        feed: {
          ...next,
          items: [...feed.items, ...next.items],
        },
      });
    } catch {
      setMoreError(true);
    } finally {
      setLoadingMore(false);
    }
  }

  const label = feed?.displayLabel ?? "Faith Corner";
  return (
    <main className="space-y-6">
      <header className="space-y-3">
        <Link
          href="/ace/family"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent-strong underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
        >
          Back to your family
        </Link>
        {selected ? (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                returning.current = true;
                setSelectedId(null);
              }}
            >
              Back to {label}
            </Button>
            <h1
              ref={detailHeading}
              tabIndex={-1}
              className="font-heading text-3xl font-semibold tracking-tight text-text-primary focus:outline-none sm:text-4xl"
            >
              {selected.title}
            </h1>
            <p className="text-sm text-text-muted">
              Published {new Date(selected.publishedAt).toLocaleDateString()}
            </p>
          </>
        ) : (
          <>
            <h1
              ref={listHeading}
              tabIndex={-1}
              className="font-heading text-3xl font-semibold tracking-tight text-text-primary focus:outline-none sm:text-4xl"
            >
              {label}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-text-muted">
              Readings shared by your school, newest first.
            </p>
          </>
        )}
      </header>

      {status === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading {label}…
          </p>
        </Card>
      ) : status !== "authenticated" ? (
        <Card title="Sign in to continue">
          <p className="text-sm text-text-muted">
            Sign in to see readings shared with your school account.
          </p>
          <Button asChild className="mt-4 min-h-11">
            <Link href="/login?returnTo=%2Face%2Ffamily">Sign in</Link>
          </Button>
        </Card>
      ) : load.state === "loading" ? (
        <Card>
          <p role="status" className="text-sm text-text-muted">
            Loading {label}…
          </p>
        </Card>
      ) : load.state === "error" ? (
        <Card>
          <div role="alert" className="space-y-3">
            <p className="text-sm text-text-primary">
              {label} could not be loaded. Check your school link and try again.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRevision((value) => value + 1)}
            >
              Try again
            </Button>
          </div>
        </Card>
      ) : selected ? (
        <FamilyFaithDetail
          key={selected.versionId}
          item={selected}
          siteId={siteId}
          childId={childId}
          reflectionsEnabled={load.feed.reflectionsEnabled}
        />
      ) : load.feed.items.length === 0 && !load.feed.nextCursor ? (
        <Card title={`No ${label} readings yet`}>
          <p className="text-sm leading-6 text-text-muted">
            Your school has not shared a reading for this account yet.
          </p>
        </Card>
      ) : (
        <div className="space-y-4">
          {load.feed.items.length === 0 ? (
            <p className="text-sm text-text-muted">
              No readings on this page. Load more to continue.
            </p>
          ) : null}
          <ul className="space-y-3">
            {load.feed.items.map((item) => (
              <li key={item.id}>
                <Card
                  title={item.title}
                  description={new Date(item.publishedAt).toLocaleDateString()}
                >
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 min-h-11"
                    onClick={() => setSelectedId(item.id)}
                  >
                    Open reading
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
          {load.feed.nextCursor ? (
            <Button
              type="button"
              variant="outline"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Loading…" : "Load more readings"}
            </Button>
          ) : null}
          {moreError ? (
            <p role="alert" className="text-sm text-text-primary">
              More readings could not be loaded. Try again.
            </p>
          ) : null}
        </div>
      )}
    </main>
  );
}

export function FamilyFaithFeed({
  siteId,
  childId,
}: {
  siteId: string;
  childId?: string;
}) {
  const { data, status } = useSession();
  if (process.env.NEXT_PUBLIC_ACE_FAITH_WEB_ENABLED !== "true") {
    return (
      <main>
        <Card title="Readings are not available yet">
          <p className="text-sm text-text-muted">
            Your school will let you know when readings are ready here.
          </p>
        </Card>
      </main>
    );
  }
  return (
    <FamilyFaithFeedView
      key={`${status}:${data?.user.id ?? ""}:${siteId}:${childId ?? ""}`}
      siteId={siteId}
      childId={childId}
      status={status}
    />
  );
}
