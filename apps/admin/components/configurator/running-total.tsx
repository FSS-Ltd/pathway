"use client";

import { useEffect, useMemo } from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from "framer-motion";
import { formatConfiguratorMoney } from "./price-chip";
import {
  calculateConfiguratorCartTotals,
  type AddonCode,
  type ModulePriceMeta,
  type PlanCode,
  type StripePriceMeta,
} from "../../lib/configurator-pricing";
import type { ModulePriceCode } from "../../lib/module-catalog";
import { totalTick } from "../../lib/motion";
import type { ConfiguratorState } from "../../app/billing/configure/state";

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
};

function buildSelection(state: ConfiguratorState) {
  if (!state.planCode) return null;
  return {
    planCode: state.planCode,
    frequency: state.frequency,
    storageAddon100Gb: state.storageChoice === "100" ? 1 : 0,
    storageAddon200Gb: state.storageChoice === "200" ? 1 : 0,
    storageAddon1Tb: state.storageChoice === "1000" ? 1 : 0,
    selectedModules: state.selectedOptionalModules,
  };
}

export function RunningTotal({
  state,
  planPrices,
  addonPrices,
  modulePrices,
}: RunningTotalProps) {
  const selection = useMemo(() => buildSelection(state), [state]);
  const totals = useMemo(
    () =>
      selection
        ? calculateConfiguratorCartTotals(selection, {
            planPrices,
            addonPrices,
            modulePrices,
          })
        : null,
    [addonPrices, modulePrices, planPrices, selection],
  );
  const prefersReducedMotion = useReducedMotion();
  const perLabel = state.frequency === "monthly" ? "/mo" : "/yr";

  return (
    <section aria-label="Running total">
      <p className="text-sm font-semibold text-text-primary">New plan total</p>
      {totals && totals.lines.length ? (
        <ul className="mt-3 space-y-1.5 text-sm">
          {totals.lines.map((line, index) => (
            <li
              key={`${line.label}-${index}`}
              className="flex items-baseline justify-between gap-3 text-text-muted"
            >
              <span>{line.label}</span>
              <span className="font-medium text-text-primary">
                {formatConfiguratorMoney(line.amountMajor)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-text-muted">
          Choose a plan to see your new total.
        </p>
      )}
      <div className="mt-4 border-t border-border-subtle pt-3">
        <p className="text-xs text-text-muted">Total {perLabel}</p>
        <AnimatedTotal
          amountMajor={totals?.totalMajor ?? 0}
          prefersReducedMotion={prefersReducedMotion}
        />
        <p className="mt-2 text-xs text-text-muted">
          You only pay the difference from your current plan. Final price, tax
          and any proration are confirmed at secure checkout.
        </p>
      </div>
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

    const controls = animate(total, amountMajor, totalTick);
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
