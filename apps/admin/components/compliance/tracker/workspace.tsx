"use client";
import React from "react";
import type {
  TrackerChecklist,
  TrackerJurisdiction,
  TrackerSignal,
} from "@pathway/types";
import { trackerClient } from "@/lib/tracker-client";
import { Action, Feedback } from "../agreements/shared";
import { ProfileDialog } from "./profile-dialog";
import { RetainedHistory } from "./retained-history";
import { RefreshCw, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { CompletionOverview } from "./completion-overview";
import { ChecklistBrowser } from "./checklist-browser";
import { CoverageNotice } from "./coverage-notice";
import { PortalEvidence } from "./portal-evidence";
import styles from "./workspace.module.css";
export function TrackerWorkspace({ canManage }: { canManage: boolean }) {
  const [data, setData] = React.useState<TrackerChecklist | null>(null);
  const [jurisdictions, setJurisdictions] = React.useState<
    TrackerJurisdiction[]
  >([]);
  const [signals, setSignals] = React.useState<TrackerSignal[]>([]);
  const [busy, setBusy] = React.useState(true);
  const [error, setError] = React.useState("");
  const [signalError, setSignalError] = React.useState("");
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<
    "overview" | "checklist" | "records"
  >("overview");
  const controller = React.useRef<AbortController | null>(null);
  const refresh = React.useCallback(async () => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setBusy(true);
    setError("");
    setSignalError("");
    const signalRequest = trackerClient
      .signals(current.signal)
      .then((result) => {
        if (!current.signal.aborted) setSignals(result);
      })
      .catch(() => {
        if (!current.signal.aborted) {
          setSignals([]);
          setSignalError(
            "Live evidence is unavailable. Evidence status is unknown; manual confirmations are unchanged.",
          );
        }
      });
    try {
      const [checklist, locations] = await Promise.all([
        trackerClient.checklist(current.signal),
        trackerClient.jurisdictions(current.signal),
      ]);
      if (!current.signal.aborted) {
        setData(checklist);
        setJurisdictions(locations);
      }
    } catch {
      if (!current.signal.aborted)
        setError(
          "The tracker could not be refreshed. Displayed records may be out of date. Retry before making a confirmation.",
        );
    } finally {
      await signalRequest;
      if (!current.signal.aborted) setBusy(false);
    }
  }, []);
  React.useEffect(() => {
    void refresh();
    return () => controller.current?.abort();
  }, [refresh]);
  const changed = () => void refresh();
  return (
    <div className={styles.workspace}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>
            <ShieldCheck size={15} aria-hidden="true" /> Compliance
          </p>
          <h1 className={styles.title}>Overview &amp; Tracker</h1>
          <p className={styles.description}>
            Review what’s done, what needs attention and the records behind it.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            type="button"
            className={styles.refresh}
            disabled={!data}
            onClick={() => setProfileOpen(true)}
          >
            <SlidersHorizontal size={16} aria-hidden="true" /> Site compliance
            profile
          </button>
          <button
            type="button"
            className={styles.refresh}
            aria-label="Refresh tracker and evidence"
            disabled={busy}
            onClick={changed}
          >
            <RefreshCw size={16} aria-hidden="true" /> Refresh
          </button>
        </div>
      </header>
      <Feedback busy={busy} error={error} success="" />
      {error && (
        <Action disabled={busy} onClick={changed}>
          Retry tracker
        </Action>
      )}
      {data && (
        <>
          {(!data.profile || data.profileNeedsSync) && (
            <p className={styles.setupNotice} role="status">
              {data.profileNeedsSync
                ? "Organisation details changed. Review and save the site profile before confirming actions."
                : "Set the site’s operating location in the site compliance profile to find its checklist. A time zone is not an operating jurisdiction."}
              {canManage && (
                <button type="button" onClick={() => setProfileOpen(true)}>
                  Open site profile
                </button>
              )}
            </p>
          )}
          <div
            className={styles.tabs}
            role="tablist"
            aria-label="Compliance views"
          >
            {(["overview", "checklist", "records"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                id={`tracker-tab-${tab}`}
                aria-controls={`tracker-panel-${tab}`}
                aria-selected={activeTab === tab}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight")
                    return;
                  const tabs = ["overview", "checklist", "records"] as const;
                  const next =
                    tabs[
                      (tabs.indexOf(tab) +
                        (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                        tabs.length
                    ];
                  setActiveTab(next);
                  document.getElementById(`tracker-tab-${next}`)?.focus();
                }}
              >
                {tab === "overview"
                  ? "Overview"
                  : tab === "checklist"
                    ? "Checklist"
                    : "Evidence & history"}
              </button>
            ))}
          </div>
          <fieldset disabled={busy || Boolean(error)} className={styles.body}>
            <div
              role="tabpanel"
              id="tracker-panel-overview"
              aria-labelledby="tracker-tab-overview"
              hidden={activeTab !== "overview"}
            >
              <CompletionOverview
                progress={data.progress}
                coverageGaps={data.coverageGaps}
                observedAt={data.observedAt}
              />
            </div>
            <div
              role="tabpanel"
              id="tracker-panel-checklist"
              aria-labelledby="tracker-tab-checklist"
              hidden={activeTab !== "checklist"}
            >
              <ChecklistBrowser
                categories={data.categories}
                items={data.items}
                profileVersion={data.profile?.version ?? 0}
                canManage={
                  canManage && Boolean(data.profile) && !data.profileNeedsSync
                }
                onChange={changed}
              />
            </div>
            <div
              role="tabpanel"
              id="tracker-panel-records"
              aria-labelledby="tracker-tab-records"
              hidden={activeTab !== "records"}
            >
              <div className={styles.support}>
                <PortalEvidence signals={signals} error={signalError} />
                <div className={styles.supportCard}>
                  <RetainedHistory />
                </div>
              </div>
            </div>
          </fieldset>
          {data.coverageGaps > 0 && <CoverageNotice coverage={data.coverage} />}
          {profileOpen && (
            <ProfileDialog
              checklist={data}
              jurisdictions={jurisdictions}
              canManage={canManage}
              disabled={busy || Boolean(error)}
              onClose={() => setProfileOpen(false)}
              onSaved={() => {
                setProfileOpen(false);
                changed();
              }}
            />
          )}
        </>
      )}
    </div>
  );
}
