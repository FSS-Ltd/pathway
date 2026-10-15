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
import { RequirementRow } from "./requirement-row";
import { RetainedHistory } from "./retained-history";
import { words } from "./profile-fields";
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
    <div className="min-w-0 space-y-6">
      <header className="max-w-3xl space-y-2">
        <h1 className="text-2xl font-semibold">Overview &amp; Tracker</h1>
        <p className="text-text-muted">
          Track this site’s applicable actions and supporting records. Checklist
          completion is manually confirmed and is not legal certification.
        </p>
        <Action variant="secondary" disabled={busy} onClick={changed}>
          Refresh tracker and evidence
        </Action>
      </header>
      <Feedback busy={busy} error={error} success="" />
      {error && (
        <Action disabled={busy} onClick={changed}>
          Retry tracker
        </Action>
      )}
      {data && (
        <fieldset
          disabled={busy || Boolean(error)}
          className="min-w-0 space-y-6"
        >
          <section
            aria-label="Checklist completion"
            className="space-y-3 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5"
          >
            <h2 className="text-xl font-semibold">
              {data.progress.applicable
                ? `${data.progress.completed} of ${data.progress.applicable} applicable actions completed`
                : "No applicable items"}
            </h2>
            {data.progress.applicable > 0 && (
              <progress
                aria-label="Checklist completion"
                className="w-full"
                value={data.progress.completed}
                max={data.progress.applicable}
              />
            )}
            <dl
              className="grid gap-3"
              style={{
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 9rem), 1fr))",
              }}
            >
              {(
                [
                  ["Unresolved applicability", data.progress.unresolved],
                  ["Coverage gaps", data.coverageGaps],
                  ["Overdue reviews", data.progress.overdue],
                  ["Confirmations needing renewal", data.progress.stale],
                  ["Evidence gaps", data.progress.evidenceGaps],
                  ["Not applicable decisions", data.progress.notApplicable],
                ] as const
              ).map(([label, count]) => (
                <div key={label}>
                  <dt className="text-sm text-text-muted">{label}</dt>
                  <dd className="text-lg font-semibold">{count}</dd>
                </div>
              ))}
            </dl>
            <p className="text-sm text-text-muted">
              Observed {new Date(data.observedAt).toLocaleString()}
            </p>
          </section>
          {data.coverageGaps > 0 && (
            <section
              className="space-y-3 rounded-xl border border-border-subtle p-4"
              aria-label="Coverage limitations"
            >
              <h2 className="font-semibold">Coverage is incomplete</h2>
              <p>
                Unavailable or unreviewed packs do not mean there are no
                obligations. Completion only covers applicable published
                actions.
              </p>
              <details>
                <summary className="cursor-pointer font-medium">
                  Review jurisdiction and topic coverage
                </summary>
                <ul className="mt-3 space-y-3">
                  {data.coverage.map((cell, index) => (
                    <li key={index} className="break-words">
                      <strong>{words(cell.topic)}</strong> ·{" "}
                      {cell.jurisdiction ?? "Location unresolved"} ·{" "}
                      {cell.sector ? words(cell.sector) : "Sector unresolved"}
                      <p>
                        {words(cell.status)} · Regional coverage:{" "}
                        {words(cell.regionalStatus)}
                      </p>
                      <p className="text-sm text-text-muted">{cell.reason}</p>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
          <ProfileEditor
            initial={data.profile}
            jurisdictions={jurisdictions}
            canManage={canManage}
            onSaved={changed}
          />
          <section className="space-y-4">
            <h2 className="text-xl font-semibold">Checklist actions</h2>
            {!data.items.length && (
              <p>
                No published actions are available for the current profile.
                Review the coverage details and keep the site profile current.
              </p>
            )}
            {data.categories.map((category) => (
              <section key={category.topic} className="space-y-3">
                <h3 className="font-semibold">
                  {words(category.topic)}{" "}
                  <span className="font-normal text-text-muted">
                    ·{" "}
                    {category.applicable
                      ? `${category.completed} of ${category.applicable} completed`
                      : "No applicable items"}
                  </span>
                </h3>
                {data.items
                  .filter((item) => item.requirement.topic === category.topic)
                  .map((item) => (
                    <RequirementRow
                      key={`${item.requirement.id}:${item.requirement.version}`}
                      item={item}
                      profileVersion={data.profile?.version ?? 0}
                      canManage={canManage}
                      onChange={changed}
                    />
                  ))}
              </section>
            ))}
          </section>
        </fieldset>
      )}
      <RetainedHistory />
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Live portal evidence</h2>
        <p className="text-sm text-text-muted">
          Recorded evidence does not prove legal adequacy and never ticks a
          checkbox.
        </p>
        {signalError && <p role="alert">{signalError}</p>}
        <ul className="divide-y divide-border-subtle">
          {signals.map((value) => (
            <li key={value.key} className="space-y-1 py-3">
              <h3 className="font-semibold">
                {words(value.key)} ·{" "}
                {value.status === "UNKNOWN"
                  ? "Unknown"
                  : `${value.count ?? 0} recorded`}
              </h3>
              <p>{value.description}</p>
              {value.missingCount !== null && (
                <p>{value.missingCount} missing information</p>
              )}
              <p className="text-sm text-text-muted">
                Observed {new Date(value.observedAt).toLocaleString()}
              </p>
              {value.href && (
                <a className="underline" href={value.href}>
                  View {words(value.key).toLowerCase()} records
                </a>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
