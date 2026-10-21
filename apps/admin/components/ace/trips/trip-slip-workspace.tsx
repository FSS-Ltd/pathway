"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import { NoAccessCard } from "@/components/no-access-card";
import { useAdminContext } from "@/lib/admin-context";
import { requestFailure } from "@/lib/request-error";
import {
  fetchSlipAudienceOptions,
  fetchStaffSlips,
  fetchStaffTrips,
  type StaffSlipList,
  type StaffTrip,
} from "@/lib/ace-trip-slips-api";
import { SlipDraftForm, TripDraftForm } from "./trip-slip-draft-form";
import { TripSlipStaffDetail } from "./trip-slip-staff-detail";

type WorkspaceData = {
  trips: StaffTrip[];
  nextTripCursor: string | null;
  slips: StaffSlipList["items"];
  nextSlipCursor: string | null;
  children: Array<{ id: string; name: string }>;
  witnesses: Array<{ id: string; name: string }>;
  limitReached: boolean;
  publicationEnabled: boolean;
};

export function TripSlipWorkspace() {
  const { state } = useAdminContext();
  const siteId = state.status === "ready" ? state.snapshot.activeSiteId : null;
  const permissions =
    state.status === "ready" ? state.snapshot.permissions : [];
  const canRead = permissions.includes("school.permission_slips.read");
  const canManage = permissions.includes("school.permission_slips.manage");
  const [data, setData] = React.useState<WorkspaceData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [revision, setRevision] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [loadingMore, setLoadingMore] = React.useState<
    "trips" | "slips" | null
  >(null);
  const [moreError, setMoreError] = React.useState<string | null>(null);
  const heading = React.useRef<HTMLHeadingElement>(null);
  const currentSite = React.useRef(siteId);
  currentSite.current = siteId;

  React.useEffect(() => {
    setSelected(null);
  }, [siteId]);

  React.useEffect(() => {
    if (!siteId || !canRead) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setData(null);
    setMoreError(null);
    void Promise.all([
      fetchStaffTrips(siteId, controller.signal),
      fetchStaffSlips(siteId, controller.signal),
      fetchSlipAudienceOptions(siteId, controller.signal),
    ])
      .then(([trips, slips, audience]) => {
        if (!controller.signal.aborted)
          setData({
            trips: trips.items,
            nextTripCursor: trips.nextCursor,
            slips: slips.items,
            nextSlipCursor: slips.nextCursor,
            children: audience.children,
            witnesses: audience.witnesses,
            limitReached: audience.limitReached,
            publicationEnabled: audience.publicationEnabled,
          });
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(requestFailure(cause, "Unable to load trips.").message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [siteId, canRead, revision]);

  async function loadMore(kind: "trips" | "slips") {
    if (!siteId || !data || loadingMore) return;
    const cursor = kind === "trips" ? data.nextTripCursor : data.nextSlipCursor;
    if (!cursor) return;
    setLoadingMore(kind);
    setMoreError(null);
    try {
      if (kind === "trips") {
        const page = await fetchStaffTrips(siteId, undefined, cursor);
        if (currentSite.current === siteId)
          setData(
            (current) =>
              current && {
                ...current,
                trips: [...current.trips, ...page.items],
                nextTripCursor: page.nextCursor,
              },
          );
      } else {
        const page = await fetchStaffSlips(siteId, undefined, cursor);
        if (currentSite.current === siteId)
          setData(
            (current) =>
              current && {
                ...current,
                slips: [...current.slips, ...page.items],
                nextSlipCursor: page.nextCursor,
              },
          );
      }
    } catch {
      if (currentSite.current === siteId)
        setMoreError(`More ${kind} could not be loaded. Try again.`);
    } finally {
      setLoadingMore(null);
    }
  }

  if (state.status === "loading" || state.status === "switching")
    return (
      <main>
        <Card>
          <p role="status">Loading school access…</p>
        </Card>
      </main>
    );
  if (!siteId || !canRead) return <NoAccessCard />;

  return (
    <main className="min-w-0 space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-accent-strong">ACE / Trips</p>
        <h1
          ref={heading}
          tabIndex={-1}
          className="font-heading text-3xl font-semibold text-text-primary focus:outline-none"
        >
          Trips and permission slips
        </h1>
        <p className="max-w-2xl text-sm leading-6 text-text-muted">
          Prepare each trip, review its exact consent wording and selected
          pupils, then track responses.
        </p>
      </header>
      {loading ? (
        <Card>
          <p role="status">Loading trips…</p>
        </Card>
      ) : null}
      {error ? (
        <Card title="Trips could not be loaded">
          <p role="alert" className="text-sm">
            {error}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => setRevision((value) => value + 1)}
          >
            Try again
          </Button>
        </Card>
      ) : null}
      {data && selected ? (
        <TripSlipStaffDetail
          key={`${siteId}:${selected}`}
          siteId={siteId}
          slipId={selected}
          canManage={canManage}
          publicationEnabled={data.publicationEnabled}
          witnesses={data.witnesses}
          onClose={() => {
            setSelected(null);
            setRevision((value) => value + 1);
            requestAnimationFrame(() => heading.current?.focus());
          }}
        />
      ) : data ? (
        <>
          <Card title="Permission slips">
            {data.slips.length === 0 ? (
              <p className="text-sm text-text-muted">
                No slips have been drafted for this school yet.
              </p>
            ) : (
              <ul className="space-y-3">
                {data.slips.map((slip) => (
                  <li
                    key={slip.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle py-3"
                  >
                    <div>
                      <p className="font-semibold text-text-primary">
                        {slip.trip.title}
                      </p>
                      <p className="text-sm text-text-muted">
                        {slip.versions[0]?.publishedAt
                          ? `Published version ${slip.versions[0].version}`
                          : "Private draft"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-11"
                      onClick={() => setSelected(slip.id)}
                    >
                      Review slip
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {data.nextSlipCursor ? (
              <Button
                type="button"
                variant="outline"
                disabled={loadingMore !== null}
                onClick={() => void loadMore("slips")}
                className="mt-3 min-h-11"
              >
                {loadingMore === "slips" ? "Loading…" : "Load more slips"}
              </Button>
            ) : null}
          </Card>
          {moreError ? (
            <p role="alert" className="text-sm text-text-primary">
              {moreError}
            </p>
          ) : null}
          {canManage ? (
            <div className="space-y-4">
              {data.nextTripCursor ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={loadingMore !== null}
                  onClick={() => void loadMore("trips")}
                  className="min-h-11"
                >
                  {loadingMore === "trips"
                    ? "Loading…"
                    : "Load more trips for drafting"}
                </Button>
              ) : null}
              <div className="grid gap-5 lg:grid-cols-2">
                <TripDraftForm
                  siteId={siteId}
                  onCreated={() => setRevision((value) => value + 1)}
                />
                <SlipDraftForm
                  siteId={siteId}
                  trips={data.trips}
                  children={data.children}
                  limitReached={data.limitReached}
                  onCreated={(slipId) => {
                    setSelected(slipId);
                    setRevision((value) => value + 1);
                  }}
                />
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
