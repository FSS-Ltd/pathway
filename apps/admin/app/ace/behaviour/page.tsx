"use client";

import React from "react";
import { useAdminContext } from "@/lib/admin-context";
import { NoAccessCard } from "@/components/no-access-card";
import { BehaviourForm } from "@/components/ace/behaviour/behaviour-form";
import { BehaviourBatchForm } from "@/components/ace/behaviour/behaviour-batch-form";
import { BehaviourRecentWorkspace } from "@/components/ace/behaviour/behaviour-recent-workspace";
import { BehaviourStageReview } from "@/components/ace/behaviour/behaviour-stage-review";
import { BehaviourTrends } from "@/components/ace/behaviour/behaviour-trends";
import {
  BehaviourWorkspaceTabs,
  type BehaviourWorkspaceTab,
} from "@/components/ace/behaviour/behaviour-workspace-tabs";
import { isValidIanaTimeZone } from "@/components/ace/behaviour/behaviour-time";
import {
  createDemeritOverride,
  fetchBehaviourPolicy,
  fetchBehaviourReviewRequests,
  fetchBehaviourReviewFact,
  fetchChildren,
  fetchDemeritStatus,
  recordBehaviour,
  recordBehaviourBatch,
  type AdminBehaviourCategory,
} from "@/lib/api-client";
import { useAdminAccess } from "@/lib/use-admin-access";
import { requestFailure } from "@/lib/request-error";

export default function BehaviourPage() {
  const { state: adminState } = useAdminContext();
  const { permissions, isLoading: isLoadingAccess } = useAdminAccess();
  const canRead = hasFreshPermission(permissions, "ace.behaviour.read");
  const canRecord = hasFreshPermission(permissions, "ace.behaviour.record");
  const canCorrect = hasFreshPermission(permissions, "ace.behaviour.correct");
  const canSensitive = hasFreshPermission(
    permissions,
    "ace.behaviour.sensitive.read",
  );
  const canManagePolicy = hasFreshPermission(
    permissions,
    "ace.behaviour.policy.manage",
  );
  const permissionKey = permissions?.slice().sort().join("|") ?? "none";
  const [children, setChildren] = React.useState<
    Array<{ id: string; fullName: string }>
  >([]);
  const [categories, setCategories] = React.useState<AdminBehaviourCategory[]>(
    [],
  );
  const [loadedSiteId, setLoadedSiteId] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<BehaviourWorkspaceTab>("record");
  const [entryMode, setEntryMode] = React.useState<"single" | "batch">(
    "single",
  );
  const loadId = React.useRef(0);
  const activeSite =
    adminState.status === "ready"
      ? adminState.snapshot.sites.find(
          (site) => site.id === adminState.snapshot.activeSiteId,
        )
      : null;
  const activeSiteId = activeSite?.id ?? null;
  const siteTimeZone = activeSite?.timezone ?? null;
  const siteReady = Boolean(activeSiteId && loadedSiteId === activeSiteId);
  const siteChildren = siteReady ? children : [];
  const siteCategories = siteReady ? categories : [];
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

  const load = React.useCallback(async () => {
    const request = ++loadId.current;
    setIsLoading(true);
    setError(null);
    setChildren([]);
    setCategories([]);
    setLoadedSiteId(null);
    try {
      if (!siteTimeZone || !isValidIanaTimeZone(siteTimeZone)) {
        throw new Error("The active site timezone is unavailable.");
      }
      const [nextChildren, policy] = await Promise.all([
        fetchChildren(),
        fetchBehaviourPolicy(),
      ]);
      if (request !== loadId.current) return;
      setChildren(
        nextChildren
          .filter((child) => child.status === "active")
          .map((child) => ({ id: child.id, fullName: child.fullName })),
      );
      setCategories(policy.categories);
      setLoadedSiteId(activeSiteId);
      setRefreshKey((current) => current + 1);
    } catch (cause) {
      if (request === loadId.current)
        setError(
          requestFailure(cause, "Unable to load behaviour categories.").message,
        );
    } finally {
      if (request === loadId.current) setIsLoading(false);
    }
  }, [activeSiteId, siteTimeZone]);

  React.useEffect(() => {
    if (isLoadingAccess || !canRead) {
      loadId.current += 1;
      setChildren([]);
      setCategories([]);
      setLoadedSiteId(null);
      return;
    }
    void load();
    return () => {
      loadId.current += 1;
    };
  }, [canRead, isLoadingAccess, load]);

  if (isLoadingAccess) return null;
  if (!canRead) {
    return (
      <NoAccessCard
        title="Behaviour capture"
        message="You do not have permission to view ACE behaviour records."
      />
    );
  }

  return (
    <div className="min-w-0 space-y-5 pb-8">
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-border-subtle pb-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">
            ACE · Behaviour
          </p>
          <h1 className="mt-1 font-heading text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">
            Behaviour
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            Record a moment, review recent entries, and see the pattern in one
            workspace.
          </p>
        </div>
        {activeSite ? (
          <span className="rounded-full border border-border-subtle bg-surface px-3 py-1.5 text-xs font-medium text-text-muted">
            {activeSite.name}
          </span>
        ) : null}
      </header>

      <BehaviourWorkspaceTabs value={tab} onChange={setTab} />

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-status-danger/30 bg-status-danger/5 p-4 text-sm text-status-danger"
        >
          {error}
        </p>
      ) : null}

      <div
        id="behaviour-record-panel"
        role="tabpanel"
        aria-labelledby="behaviour-record-tab"
        hidden={tab !== "record"}
      >
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,.95fr)]">
          <div className="min-w-0">
            {canRecord && siteTimeZone && isValidIanaTimeZone(siteTimeZone) ? (
              <section className="rounded-xl border border-border-subtle bg-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-heading text-lg font-semibold text-text-primary">
                      Record behaviour
                    </h2>
                    <p className="text-sm text-text-muted">
                      Choose a single entry or record up to 50 facts in one
                      batch.
                    </p>
                  </div>
                  <div
                    role="group"
                    aria-label="Recording mode"
                    className="inline-flex gap-1 rounded-lg bg-muted p-1"
                  >
                    {(["single", "batch"] as const).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={entryMode === mode}
                        onClick={() => setEntryMode(mode)}
                        className={`min-h-9 rounded-md px-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${entryMode === mode ? "bg-surface text-text-primary shadow-sm" : "text-text-muted"}`}
                      >
                        {mode === "single" ? "Single" : "Batch"}
                      </button>
                    ))}
                  </div>
                </div>
                <div hidden={entryMode !== "single"}>
                  <BehaviourForm
                    key={`single-${activeSiteId}`}
                    children={siteChildren}
                    categories={siteCategories}
                    canSensitive={canSensitive}
                    siteTimeZone={siteTimeZone}
                    disabled={isLoading || !siteReady}
                    onSave={recordBehaviour}
                    onSuccess={load}
                    compact
                  />
                </div>
                <div hidden={entryMode !== "batch"} className="mt-4">
                  <BehaviourBatchForm
                    key={`batch-${activeSiteId}-${canSensitive}`}
                    children={siteChildren}
                    categories={siteCategories}
                    canSensitive={canSensitive}
                    siteTimeZone={siteTimeZone}
                    disabled={isLoading || !siteReady}
                    onSave={recordBehaviourBatch}
                    onSuccess={load}
                  />
                </div>
              </section>
            ) : (
              <p className="rounded-xl bg-muted p-4 text-sm text-text-muted">
                Recording is unavailable for this site or access level.
              </p>
            )}
          </div>
          {siteTimeZone && isValidIanaTimeZone(siteTimeZone) ? (
            <BehaviourRecentWorkspace
              key={`recent-${activeSiteId}-${permissionKey}`}
              children={siteChildren}
              categories={siteCategories}
              canCorrect={canCorrect}
              canVoid={canManagePolicy}
              canSensitive={canSensitive}
              siteTimeZone={siteTimeZone}
              refreshKey={refreshKey}
              onChanged={load}
            />
          ) : null}
        </div>
        {siteTimeZone && isValidIanaTimeZone(siteTimeZone) ? (
          <details className="mt-4 rounded-xl border border-border-subtle bg-surface">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
              Stage status, escalation and review requests
            </summary>
            <div className="border-t border-border-subtle p-3">
              <BehaviourStageReview
                key={`stage-${activeSiteId}`}
                children={siteChildren}
                siteTimeZone={siteTimeZone}
                canSensitive={canSensitive}
                canManagePolicy={canManagePolicy}
                refreshKey={refreshKey}
                loadStatus={fetchDemeritStatus}
                loadRequests={fetchBehaviourReviewRequests}
                loadFact={fetchBehaviourReviewFact}
                saveOverride={createDemeritOverride}
                onSaved={load}
              />
            </div>
          </details>
        ) : null}
      </div>

      <div
        id="behaviour-trends-panel"
        role="tabpanel"
        aria-labelledby="behaviour-trends-tab"
        hidden={tab !== "trends"}
      >
        {siteTimeZone && isValidIanaTimeZone(siteTimeZone) ? (
          <BehaviourTrends
            key={`trends-${activeSiteId}-${permissionKey}`}
            active={tab === "trends"}
            canSensitive={canSensitive}
            siteTimeZone={siteTimeZone}
            refreshKey={refreshKey}
          />
        ) : null}
      </div>
    </div>
  );
}

function hasFreshPermission(
  permissions: string[] | null,
  permission: string,
): boolean {
  return permissions?.includes(permission) === true;
}
