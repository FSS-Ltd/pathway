"use client";
import React from "react";
import type {
  TrackerChecklist,
  TrackerJurisdiction,
  TrackerSignal,
} from "@pathway/types";
import { trackerClient } from "@/lib/tracker-client";
import { Action, Feedback } from "../agreements/shared";
import { ProfileEditor } from "./profile-editor";
import { RetainedHistory } from "./retained-history";
import { RefreshCw, ShieldCheck } from "lucide-react";
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
        <button
          type="button"
          className={styles.refresh}
          aria-label="Refresh tracker and evidence"
          disabled={busy}
          onClick={changed}
        >
          <RefreshCw size={16} aria-hidden="true" /> Refresh
        </button>
      </header>
      <Feedback busy={busy} error={error} success="" />
      {error && (
        <Action disabled={busy} onClick={changed}>
          Retry tracker
        </Action>
      )}
      {data && (
        <fieldset disabled={busy || Boolean(error)} className={styles.body}>
          <CompletionOverview
            progress={data.progress}
            coverageGaps={data.coverageGaps}
            observedAt={data.observedAt}
          />
          {data.coverageGaps > 0 && <CoverageNotice coverage={data.coverage} />}
          <div className={styles.profile}>
            <ProfileEditor
              initial={data.profile}
              jurisdictions={jurisdictions}
              canManage={canManage}
              onSaved={changed}
            />
          </div>
          <ChecklistBrowser
            categories={data.categories}
            items={data.items}
            profileVersion={data.profile?.version ?? 0}
            canManage={canManage}
            onChange={changed}
          />
        </fieldset>
      )}
      <div className={styles.support}>
        <PortalEvidence signals={signals} error={signalError} />
        <div className={styles.supportCard}>
          <RetainedHistory />
        </div>
      </div>
    </div>
  );
}
