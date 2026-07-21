"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { VERTICAL_LABELS } from "@pathway/types";
import { PLANS } from "@pathway/pricing";
import { formatConfiguratorMoney } from "./price-chip";
import {
  calculateCartTotals,
  type AddonCode,
  type ModulePriceMeta,
  type PlanCode,
  type StripePriceMeta,
} from "../../lib/buy-now-pricing";
import {
  previewPlanSelection,
  type PlanPreviewResponse,
} from "../../lib/buy-now-client";
import type { ModulePriceCode } from "../../lib/module-catalog";
import type { ConfiguratorState } from "../../app/configure/state";

type RunningTotalProps = {
  state: ConfiguratorState;
  planPrices: Partial<Record<PlanCode, StripePriceMeta>>;
  addonPrices: Partial<
    Record<
      AddonCode,
      { amountMajor: number; label: string; stripePriceId?: string }
    >
  >;
  modulePrices: Partial<Record<ModulePriceCode, ModulePriceMeta>>;
  showEntitlementPreview: boolean;
};

function storageGb(storageChoice: ConfiguratorState["storageChoice"]): number {
  if (storageChoice === "100") return 100;
  if (storageChoice === "200") return 200;
  if (storageChoice === "1000") return 1000;
  return 0;
}

function buildSelection(state: ConfiguratorState) {
  if (!state.planCode) return null;
  return {
    planCode: state.planCode,
    frequency: state.frequency,
    storageAddon100Gb: state.storageChoice === "100" ? 1 : 0,
    storageAddon200Gb: state.storageChoice === "200" ? 1 : 0,
    storageAddon1Tb: state.storageChoice === "1000" ? 1 : 0,
    selectedModules: state.selectedModules,
  };
}

export function RunningTotal({
  state,
  planPrices,
  addonPrices,
  modulePrices,
  showEntitlementPreview,
}: RunningTotalProps) {
  const selection = useMemo(() => buildSelection(state), [state]);
  const totals = useMemo(
    () =>
      selection
        ? calculateCartTotals(selection, {
            planPrices,
            addonPrices,
            modulePrices,
          })
        : null,
    [addonPrices, modulePrices, planPrices, selection],
  );
  const [preview, setPreview] = useState<PlanPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    if (!state.planCode) {
      setPreview(null);
      setPreviewError(null);
      setIsPreviewLoading(false);
      return;
    }

    const controller = new AbortController();
    const planCode = state.planCode;
    setPreviewError(null);
    setIsPreviewLoading(true);
    const timeout = window.setTimeout(async () => {
      try {
        const result = await previewPlanSelection(
          {
            planCode,
            addons: { extraStorageGb: storageGb(state.storageChoice) },
          },
          { signal: controller.signal },
        );
        if (!controller.signal.aborted) setPreview(result);
      } catch (error) {
        if (!controller.signal.aborted) {
          setPreview(null);
          setPreviewError(
            error instanceof Error
              ? error.message
              : "We couldn’t load the plan preview.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setIsPreviewLoading(false);
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [state.planCode, state.storageChoice]);

  const caption =
    state.vertical && state.planCode
      ? `${VERTICAL_LABELS[state.vertical]} · ${PLANS[state.planCode].displayName} · billed ${state.frequency}`
      : "Choose a plan to see your configuration total.";

  return (
    <section aria-labelledby="running-total-title" className="space-y-5">
      <div>
        <h2
          id="running-total-title"
          className="font-heading text-xl font-bold text-text-primary"
        >
          Your configuration
        </h2>
        <p className="mt-1 text-sm text-text-muted">{caption}</p>
      </div>
      {totals?.lines.length ? (
        <motion.div layout={!prefersReducedMotion} className="space-y-3">
          <AnimatePresence initial={!prefersReducedMotion}>
            {totals.lines.map((line) => (
              <motion.div
                layout={!prefersReducedMotion}
                key={line.label}
                initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
                className="flex items-start justify-between gap-4 text-sm"
              >
                <span className="text-text-muted">{line.label}</span>
                <span className="font-medium text-text-primary">
                  {formatConfiguratorMoney(line.amountMajor)}
                </span>
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>
      ) : (
        <p className="text-sm text-text-muted">
          Select a plan to see your total.
        </p>
      )}
      <div className="border-t border-border-subtle pt-4">
        <p className="text-sm font-medium text-text-primary">
          Total per {state.frequency === "monthly" ? "month" : "year"}
        </p>
        <AnimatedTotal
          amountMajor={totals?.totalMajor ?? 0}
          prefersReducedMotion={prefersReducedMotion}
        />
        <p className="mt-1 text-xs text-text-muted">
          Final price and tax are confirmed at checkout.
        </p>
      </div>
      {showEntitlementPreview ? (
        <EntitlementPreview
          preview={preview}
          error={previewError}
          isLoading={isPreviewLoading}
        />
      ) : null}
    </section>
  );
}

type AnimatedTotalProps = {
  amountMajor: number;
  prefersReducedMotion: boolean | null;
};

function AnimatedTotal({
  amountMajor,
  prefersReducedMotion,
}: AnimatedTotalProps) {
  const total = useMotionValue(amountMajor);
  const displayTotal = useTransform(total, formatConfiguratorMoney);

  useEffect(() => {
    if (prefersReducedMotion) {
      total.set(amountMajor);
      return;
    }

    const controls = animate(total, amountMajor);
    return () => controls.stop();
  }, [amountMajor, prefersReducedMotion, total]);

  return (
    <motion.p
      aria-live="polite"
      className="mt-1 font-heading text-3xl font-bold text-text-primary"
    >
      {displayTotal}
    </motion.p>
  );
}

type EntitlementPreviewProps = {
  preview: PlanPreviewResponse | null;
  error: string | null;
  isLoading: boolean;
};

function EntitlementPreview({
  preview,
  error,
  isLoading,
}: EntitlementPreviewProps) {
  if (isLoading)
    return (
      <p className="text-sm text-text-muted">Loading your plan entitlements…</p>
    );
  if (error)
    return (
      <p role="alert" className="text-sm text-status-danger">
        {error}
      </p>
    );
  if (!preview)
    return (
      <p className="text-sm text-text-muted">
        Choose a plan to preview included capacity.
      </p>
    );

  return (
    <div className="rounded-xl border border-border-subtle bg-surface p-4">
      <h3 className="font-semibold text-text-primary">Included capacity</h3>
      <dl className="mt-3 grid grid-cols-3 gap-3 text-sm">
        <div>
          <dt className="text-text-muted">Active People</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {preview.effectiveCaps.av30Cap?.toLocaleString("en-GB") ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Sites</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {preview.effectiveCaps.maxSites ?? "—"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Storage</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {preview.effectiveCaps.storageGbCap
              ? `${preview.effectiveCaps.storageGbCap.toLocaleString("en-GB")}GB`
              : "—"}
          </dd>
        </div>
      </dl>
    </div>
  );
}
