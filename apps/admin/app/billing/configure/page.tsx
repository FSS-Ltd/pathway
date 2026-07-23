"use client";

import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { getConfiguratorPlanPolicy, PLANS } from "@pathway/pricing";
import {
  ADDON_PRICES,
  mergeBillingPrices,
  PLAN_PRICES,
  type PlanCode,
} from "../../../lib/configurator-pricing";
import type { OptionPriceLookup, WebModule } from "../../../lib/module-catalog";
import {
  configuratorStepVariants,
  reducedStepVariants,
  type StepDirection,
} from "../../../lib/motion";
import {
  createBuyNowPurchase,
  fetchBillingOverview,
  fetchBillingPrices,
  fetchOrgModules,
  type AdminBillingOverview,
} from "../../../lib/api-client";
import { getPlanDisplayName } from "../../../lib/plan-info";
import { useAdminAccess } from "../../../lib/use-admin-access";
import { canAccessBilling } from "../../../lib/access";
import { NoAccessCard } from "../../../components/no-access-card";
import { RunningTotal } from "../../../components/configurator/running-total";
import {
  ConfiguratorStepper,
  type ConfiguratorProgressStep,
} from "../../../components/configurator/stepper";
import { PlanStep } from "./steps/plan";
import { ModulesStep } from "./steps/modules";
import { StorageStep } from "./steps/storage";
import { SummaryStep } from "./steps/summary";
import {
  firstIncompleteStep,
  includedModulesForState,
  initialStateFromSubscription,
  isConfiguratorPlanCode,
  INITIAL_CONFIGURATOR_STATE,
  nextStep,
  prevStep,
  PROGRESS_STEPS,
  selectFrequency,
  selectPlan,
  selectStorage,
  toggleModule,
  type ConfiguratorState,
  type ConfiguratorStep,
} from "./state";

type ConfiguratorAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "seed"; planCode: PlanCode }
  | { type: "plan"; planCode: PlanCode; prices: OptionPriceLookup }
  | {
      type: "frequency";
      frequency: "monthly" | "yearly";
      prices: OptionPriceLookup;
    }
  | { type: "module"; module: WebModule; prices: OptionPriceLookup }
  | { type: "storage"; storageChoice: ConfiguratorState["storageChoice"] };

const STEP_LABELS: Record<ConfiguratorStep, string> = {
  plan: "Plan",
  modules: "Modules",
  storage: "Storage",
  summary: "Summary",
};

function configuratorReducer(
  state: ConfiguratorState,
  action: ConfiguratorAction,
): ConfiguratorState {
  switch (action.type) {
    case "next":
      return nextStep(state);
    case "back":
      return prevStep(state);
    case "seed":
      return initialStateFromSubscription(action.planCode);
    case "plan":
      return selectPlan(state, action.planCode, action.prices);
    case "frequency":
      return selectFrequency(state, action.frequency, action.prices);
    case "module":
      return toggleModule(state, action.module, action.prices);
    case "storage":
      return selectStorage(state, action.storageChoice);
  }
}

function isContinueDisabled(
  state: ConfiguratorState,
  currentStep: ConfiguratorStep,
): boolean {
  return currentStep === "summary" || (currentStep === "plan" && !state.planCode);
}

function storageGb(storageChoice: ConfiguratorState["storageChoice"]): number {
  if (storageChoice === "100") return 100;
  if (storageChoice === "200") return 200;
  if (storageChoice === "1000") return 1000;
  return 0;
}

function buildRedirectUrl(path: string): string | null {
  if (typeof window === "undefined" || !window.location) return null;
  const url = new URL(path, window.location.href);
  if (url.hostname === "localhost") url.hostname = "127.0.0.1";
  return url.toString();
}

export default function ConfigurePlanPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { role, isLoading: isLoadingAccess } = useAdminAccess();
  const [state, dispatch] = useReducer(
    configuratorReducer,
    INITIAL_CONFIGURATOR_STATE,
  );
  const [billingPrices, setBillingPrices] = useState(() => mergeBillingPrices([]));
  const [overview, setOverview] = useState<AdminBillingOverview | null>(null);
  const [ownedModules, setOwnedModules] = useState<WebModule[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);
  const [stepDirection, setStepDirection] = useState<StepDirection>("forward");
  const checkoutInFlightRef = useRef(false);
  const seededRef = useRef(false);
  const prefersReducedMotion = useReducedMotion();

  // Load prices, current subscription and owned modules once authenticated.
  useEffect(() => {
    if (sessionStatus !== "authenticated" || !session) return;
    let cancelled = false;

    void (async () => {
      const [pricesResult, overviewResult, modulesResult] = await Promise.all([
        fetchBillingPrices().catch(() => null),
        fetchBillingOverview().catch(() => null),
        fetchOrgModules().catch(() => []),
      ]);
      if (cancelled) return;

      if (pricesResult?.prices?.length) {
        setBillingPrices(
          mergeBillingPrices(
            pricesResult.prices.map((p) => ({
              code: p.code,
              unitAmount: p.unitAmount,
              interval: p.interval,
            })),
          ),
        );
      }
      if (overviewResult) {
        setOverview(overviewResult);
        if (!seededRef.current && isConfiguratorPlanCode(overviewResult.planCode)) {
          seededRef.current = true;
          dispatch({ type: "seed", planCode: overviewResult.planCode });
        }
      }
      setOwnedModules(
        modulesResult
          .filter((m) => m.status === "ACTIVE")
          .map((m) => m.module as WebModule),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionStatus, session]);

  const currentStep = firstIncompleteStep(state);
  const mergedPlanPrices = useMemo(
    () => ({ ...PLAN_PRICES, ...billingPrices.planPrices }),
    [billingPrices.planPrices],
  );
  const mergedAddonPrices = useMemo(
    () => ({ ...ADDON_PRICES, ...billingPrices.addonPrices }),
    [billingPrices.addonPrices],
  );
  const storagePrices = useMemo<OptionPriceLookup>(
    () => ({ ...ADDON_PRICES, ...billingPrices.addonPrices }),
    [billingPrices.addonPrices],
  );

  const currentPlanCode: PlanCode | null = isConfiguratorPlanCode(
    overview?.planCode,
  )
    ? overview!.planCode
    : null;
  const includedModules = includedModulesForState(state);
  const eligibleOptionalModules = state.planCode
    ? [...(getConfiguratorPlanPolicy(state.planCode)?.eligibleOptionalModules ?? [])]
    : [];
  const progressSteps: ConfiguratorProgressStep[] = PROGRESS_STEPS.map((step) => ({
    id: step,
    label: STEP_LABELS[step],
  }));
  const stepVariants = prefersReducedMotion
    ? reducedStepVariants
    : configuratorStepVariants;

  const hasAddons =
    state.storageChoice !== "none" || state.selectedOptionalModules.length > 0;
  const isSamePlan = Boolean(
    state.planCode && currentPlanCode && state.planCode === currentPlanCode,
  );
  const disabledReason =
    isSamePlan && !hasAddons
      ? "This is your current plan. Add an add-on or choose a different plan to continue."
      : null;

  const handleCheckout = async () => {
    if (checkoutInFlightRef.current || !state.planCode) return;
    checkoutInFlightRef.current = true;
    setCheckoutError(null);
    setIsCheckoutPending(true);
    try {
      const successUrl = buildRedirectUrl("/billing/configure?status=success");
      const cancelUrl = buildRedirectUrl("/billing/configure?status=cancel");
      if (!successUrl || !cancelUrl) {
        setCheckoutError("Unable to determine redirect URLs in this environment.");
        return;
      }
      const response = await createBuyNowPurchase({
        planCode: state.planCode,
        extraSites: 0,
        extraStorageGb: storageGb(state.storageChoice),
        extraLeaderSeats: 0,
        selectedModules: state.selectedOptionalModules.length
          ? state.selectedOptionalModules
          : undefined,
        successUrl,
        cancelUrl,
      });
      window.location.href = response.sessionUrl;
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "We couldn't start checkout. Please try again.",
      );
    } finally {
      setIsCheckoutPending(false);
      checkoutInFlightRef.current = false;
    }
  };

  if (isLoadingAccess) {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-64 animate-pulse rounded bg-muted" />
        <div className="h-4 w-96 animate-pulse rounded bg-muted" />
      </div>
    );
  }

  if (!canAccessBilling(role)) {
    return (
      <NoAccessCard
        title="You don't have access to billing"
        message="Billing and subscription management is only available to organisation admins."
      />
    );
  }

  return (
    <main className="py-2">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr),minmax(320px,38%)]">
        <section className="max-w-xl space-y-8">
          <header className="space-y-3">
            <button
              type="button"
              onClick={() => router.push("/billing")}
              className="text-xs font-semibold text-accent-strong underline-offset-2 hover:underline"
            >
              ← Back to billing
            </button>
            <h1 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
              Upgrade your plan
            </h1>
            <p className="text-sm text-text-muted">
              Change your plan or add optional modules and storage. You only pay
              the difference, confirmed at secure checkout.
            </p>
          </header>
          {notice ? (
            <p
              role="status"
              className="rounded-lg bg-status-warning/10 px-4 py-3 text-sm text-text-primary"
            >
              {notice}
            </p>
          ) : null}
          <ConfiguratorStepper
            steps={progressSteps}
            currentStep={currentStep}
            onBack={() => {
              if (isCheckoutPending) return;
              setStepDirection("back");
              dispatch({ type: "back" });
            }}
            onContinue={() => {
              setStepDirection("forward");
              dispatch({ type: "next" });
            }}
            isBackDisabled={currentStep === "plan" || isCheckoutPending}
            isContinueDisabled={isContinueDisabled(state, currentStep)}
          />
          <div className="lg:hidden">
            <PlanComparison
              overview={overview}
              newPlanCode={state.planCode}
              storageChoice={state.storageChoice}
              selectedOptionalModules={state.selectedOptionalModules}
            />
          </div>
          <AnimatePresence mode="wait" initial={!prefersReducedMotion} custom={stepDirection}>
            <motion.div
              key={currentStep}
              custom={stepDirection}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {currentStep === "plan" ? (
                <PlanStep
                  planCode={state.planCode}
                  currentPlanCode={currentPlanCode}
                  frequency={state.frequency}
                  planPrices={mergedPlanPrices}
                  onSelectPlan={(planCode) => {
                    setNotice(null);
                    dispatch({ type: "plan", planCode, prices: billingPrices.modulePrices });
                  }}
                  onSelectFrequency={(frequency) =>
                    dispatch({ type: "frequency", frequency, prices: billingPrices.modulePrices })
                  }
                  onSelectEnterprise={() =>
                    setNotice(
                      "Enterprise is contact-only. Reach out to your Nexsteps account manager to upgrade.",
                    )
                  }
                />
              ) : null}
              {currentStep === "modules" ? (
                <ModulesStep
                  includedModules={includedModules}
                  ownedModules={ownedModules}
                  selectedOptionalModules={state.selectedOptionalModules}
                  eligibleOptionalModules={eligibleOptionalModules}
                  frequency={state.frequency}
                  prices={billingPrices.modulePrices}
                  planLabel={
                    state.planCode ? PLANS[state.planCode].displayName : "your plan"
                  }
                  onToggle={(module) =>
                    dispatch({ type: "module", module, prices: billingPrices.modulePrices })
                  }
                />
              ) : null}
              {currentStep === "storage" ? (
                <StorageStep
                  storageChoice={state.storageChoice}
                  frequency={state.frequency}
                  prices={storagePrices}
                  onSelect={(storageChoice) => dispatch({ type: "storage", storageChoice })}
                />
              ) : null}
              {currentStep === "summary" && state.planCode ? (
                <SummaryStep
                  planLabel={PLANS[state.planCode].displayName}
                  currentPlanLabel={
                    overview?.planCode ? getPlanDisplayName(overview.planCode) : null
                  }
                  frequency={state.frequency}
                  includedModules={includedModules}
                  selectedOptionalModules={state.selectedOptionalModules}
                  storageChoice={state.storageChoice}
                  onCheckout={handleCheckout}
                  isCheckoutPending={isCheckoutPending}
                  checkoutError={checkoutError}
                  disabledReason={disabledReason}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </section>
        <aside className="hidden h-fit space-y-6 lg:sticky lg:top-6 lg:block">
          <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card">
            <PlanComparison
              overview={overview}
              newPlanCode={state.planCode}
              storageChoice={state.storageChoice}
              selectedOptionalModules={state.selectedOptionalModules}
            />
          </div>
          <div className="rounded-2xl border border-border-subtle bg-surface p-5 shadow-card">
            <RunningTotal
              state={state}
              planPrices={mergedPlanPrices}
              addonPrices={mergedAddonPrices}
              modulePrices={billingPrices.modulePrices}
            />
          </div>
        </aside>
      </div>
    </main>
  );
}

type PlanComparisonProps = {
  overview: AdminBillingOverview | null;
  newPlanCode: PlanCode | null;
  storageChoice: ConfiguratorState["storageChoice"];
  selectedOptionalModules: WebModule[];
};

function PlanComparison({
  overview,
  newPlanCode,
  storageChoice,
  selectedOptionalModules,
}: PlanComparisonProps) {
  const newPlan = newPlanCode ? PLANS[newPlanCode] : null;
  const fmt = (value: number | null | undefined) =>
    value === null || value === undefined ? "—" : value.toLocaleString("en-GB");
  const storageChip =
    storageChoice === "none"
      ? null
      : storageChoice === "1000"
        ? "+1TB storage"
        : `+${storageChoice}GB storage`;

  return (
    <section aria-label="Plan comparison" className="space-y-3">
      <p className="text-sm font-semibold text-text-primary">What changes</p>
      <dl className="grid grid-cols-[1fr,auto,1fr] items-center gap-x-3 gap-y-2 text-sm">
        <Row
          label="Plan"
          current={overview?.planCode ? getPlanDisplayName(overview.planCode) : "None"}
          next={newPlan?.displayName ?? "—"}
        />
        <Row
          label="Active People"
          current={fmt(overview?.av30Cap)}
          next={fmt(newPlan?.av30Included)}
        />
        <Row
          label="Sites"
          current={fmt(overview?.maxSites)}
          next={fmt(newPlan?.maxSitesIncluded)}
        />
      </dl>
      {storageChip || selectedOptionalModules.length ? (
        <div className="flex flex-wrap gap-1.5 border-t border-border-subtle pt-3">
          {storageChip ? <Chip label={storageChip} /> : null}
          {selectedOptionalModules.map((module) => (
            <Chip key={module} label={module.replace(/_/g, " ").toLowerCase()} />
          ))}
        </div>
      ) : null}
    </section>
  );
}

function Row({
  label,
  current,
  next,
}: {
  label: string;
  current: string;
  next: string;
}) {
  return (
    <>
      <dt className="text-text-muted">{label}</dt>
      <dd className="text-center text-text-muted" aria-hidden="true">
        →
      </dd>
      <dd className="text-right font-semibold text-text-primary">
        <span className="mr-2 font-normal text-text-muted line-through">
          {current}
        </span>
        {next}
      </dd>
    </>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="rounded-full bg-accent-subtle px-2.5 py-1 text-xs font-semibold capitalize text-accent-strong">
      {label}
    </span>
  );
}
