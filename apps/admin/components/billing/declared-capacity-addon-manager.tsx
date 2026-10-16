"use client";

import React from "react";
import {
  activateDeclaredCapacityAddonTrial,
  fetchDeclaredCapacityAddonTrials,
  removeDeclaredCapacityAddonTrialSelection,
  selectDeclaredCapacityAddonTrial,
  type DeclaredCapacityAddonTrial,
  type DeclaredCapacityAddonTrials,
} from "../../lib/institutional-billing-client";
import { requestDeclaredCapacityTrialReview } from "./declared-capacity-trial-events";
import { MODULE_CATALOG } from "../../lib/module-catalog";

const MODULE_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(MODULE_CATALOG).map(([module, details]) => [
    module,
    details.label,
  ]),
);

function moduleLabel(module: string): string {
  return MODULE_LABELS[module] ?? module.replaceAll("_", " ").toLowerCase();
}

function formatDate(value: string | null): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function selectedTrialFor(
  data: DeclaredCapacityAddonTrials,
  module: string,
): DeclaredCapacityAddonTrial | undefined {
  return data.trials.find((trial) => trial.module === module);
}

export function DeclaredCapacityAddonManager() {
  const [data, setData] = React.useState<DeclaredCapacityAddonTrials | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [pendingModule, setPendingModule] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const reload = React.useCallback(async () => {
    setError(null);
    try {
      setData(await fetchDeclaredCapacityAddonTrials());
    } catch {
      setError(
        "Add-on trial information is unavailable. Check billing access and retry.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (module: string, action: () => Promise<void>) => {
    setPendingModule(module);
    setError(null);
    try {
      await action();
      await reload();
    } catch {
      setError(
        `We could not update ${moduleLabel(module)}. Refresh and try again.`,
      );
    } finally {
      setPendingModule(null);
    }
  };

  return (
    <section
      aria-labelledby="addon-trials-title"
      className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="addon-trials-title"
            className="font-heading text-xl font-bold"
          >
            Add-on trials
          </h2>
          <p className="mt-1 text-sm text-text-muted">
            Select add-ons now, then activate each trial when you are ready. The
            60-day clock starts at activation.
          </p>
        </div>
        {data ? (
          <p className="rounded-full bg-accent-subtle px-3 py-1 text-sm font-semibold text-accent-strong">
            {data.remainingSlots} of {data.trialSlotLimit} trial selections
            available
          </p>
        ) : null}
      </div>
      {loading ? (
        <p role="status" className="mt-4 text-sm text-text-muted">
          Loading add-ons…
        </p>
      ) : null}
      {error ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-status-danger/10 p-3 text-sm text-status-danger">
          <p role="alert">{error}</p>
          <button
            type="button"
            onClick={() => void reload()}
            className="font-semibold underline"
          >
            Retry
          </button>
        </div>
      ) : null}
      {data ? (
        <>
          <p className="mt-4 text-xs text-text-muted">
            Trial selections do not start the trial or create a charge. A module
            can use one lifetime trial per organisation. Declines, expiries and
            downgrades do not restore a used slot.
          </p>
          <ul className="mt-4 divide-y divide-border-subtle">
            {data.trials.map((trial) => (
              <li
                key={trial.module}
                className="flex flex-wrap items-center justify-between gap-3 py-4"
              >
                <div className="min-w-0">
                  <h3 className="font-semibold">{moduleLabel(trial.module)}</h3>
                  <p className="mt-1 text-sm text-text-muted">
                    {trial.status === "SELECTED"
                      ? "Selected; not activated"
                      : null}
                    {trial.status === "ACTIVE"
                      ? `Active · expires ${formatDate(trial.expiresAt)}`
                      : null}
                    {trial.status === "EXPIRED"
                      ? `Expired ${formatDate(trial.expiresAt)}`
                      : null}
                    {trial.status === "DECLINED"
                      ? `Declined ${formatDate(trial.expiresAt)}`
                      : null}
                    {trial.status === "CONVERTED"
                      ? "Paid access confirmed"
                      : null}
                  </p>
                  {trial.status === "SELECTED" ? (
                    <p className="mt-1 text-xs text-text-muted">
                      Activating starts the full 60-day period immediately.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {trial.status === "SELECTED" ? (
                    <>
                      <button
                        type="button"
                        disabled={pendingModule !== null}
                        onClick={() =>
                          void run(trial.module, () =>
                            activateDeclaredCapacityAddonTrial(trial.module),
                          )
                        }
                        className="rounded-lg bg-accent-primary px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-50"
                      >
                        {pendingModule === trial.module
                          ? "Activating…"
                          : "Activate 60-day trial"}
                      </button>
                      <button
                        type="button"
                        disabled={pendingModule !== null}
                        onClick={() =>
                          void run(trial.module, () =>
                            removeDeclaredCapacityAddonTrialSelection(
                              trial.module,
                            ),
                          )
                        }
                        className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  ) : null}
                  {trial.status === "EXPIRED" && !trial.decisionRecorded ? (
                    <button
                      type="button"
                      onClick={() =>
                        requestDeclaredCapacityTrialReview(trial.module)
                      }
                      className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold"
                    >
                      Review feature
                    </button>
                  ) : null}
                  {trial.status === "EXPIRED" && trial.decisionRecorded ? (
                    <button
                      type="button"
                      onClick={() =>
                        requestDeclaredCapacityTrialReview(trial.module)
                      }
                      className="rounded-lg border border-border-subtle px-3 py-2 text-sm font-semibold"
                    >
                      Continue purchase review
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
            {data.availableModules.map((module) => {
              const trial = selectedTrialFor(data, module);
              if (trial) return null;
              return (
                <li
                  key={module}
                  className="flex flex-wrap items-center justify-between gap-3 py-4"
                >
                  <div className="min-w-0">
                    <h3 className="font-semibold">{moduleLabel(module)}</h3>
                    <p className="mt-1 text-sm text-text-muted">
                      Ready to select for a free 60-day trial.
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={
                      pendingModule !== null || data.remainingSlots === 0
                    }
                    onClick={() =>
                      void run(module, () =>
                        selectDeclaredCapacityAddonTrial(module),
                      )
                    }
                    className="rounded-lg border border-accent-strong px-3 py-2 text-sm font-semibold text-accent-strong disabled:opacity-50"
                  >
                    {pendingModule === module ? "Selecting…" : "Select trial"}
                  </button>
                </li>
              );
            })}
          </ul>
          {data.availableModules.length === 0 && data.trials.length === 0 ? (
            <p className="mt-4 text-sm text-text-muted">
              No add-ons are available for trial at this time.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
