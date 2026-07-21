"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ADDON_PRICES,
  PLAN_PRICES,
  mergeBillingPrices,
  type PlanCode,
} from "../../lib/buy-now-pricing";
import {
  createCheckoutSession,
  fetchPublicBillingPrices,
} from "../../lib/buy-now-client";
import { buildCheckoutPayload } from "../../lib/configurator-checkout";
import type {
  OptionPriceLookup,
  StorageChoice,
  WebModule,
} from "../../lib/module-catalog";
import {
  configuratorStepVariants,
  reducedStepVariants,
  type StepDirection,
} from "../../lib/motion";
import { RunningTotal } from "../../components/configurator/running-total";
import { ConfiguratorStage } from "../../components/configurator/stage";
import {
  ConfiguratorStepper,
  type ConfiguratorProgressStep,
} from "../../components/configurator/stepper";
import { IncludedStep } from "./steps/included";
import { ModulesStep } from "./steps/modules";
import { OrgTypeStep } from "./steps/org-type";
import { PlanStep } from "./steps/plan";
import { StorageStep } from "./steps/storage";
import { SummaryStep, type AccountDetails } from "./steps/summary";
import { VerticalStep } from "./steps/vertical";
import {
  firstIncompleteStep,
  INITIAL_CONFIGURATOR_STATE,
  nextStep,
  prevStep,
  progressStepsForOrgType,
  selectFrequency,
  selectOrgType,
  selectPlan,
  selectStorage,
  selectVertical,
  toggleModule,
  type ConfiguratorState,
  type ConfiguratorStep,
  type OrgType,
} from "./state";
import type { Vertical } from "@pathway/types";

type ConfiguratorAction =
  | { type: "next" }
  | { type: "back" }
  | { type: "org-type"; orgType: OrgType }
  | { type: "vertical"; vertical: Vertical }
  | { type: "module"; module: WebModule }
  | { type: "plan"; planCode: PlanCode }
  | {
      type: "frequency";
      frequency: "monthly" | "yearly";
      prices: OptionPriceLookup;
    }
  | { type: "storage"; storageChoice: StorageChoice };

const STEP_LABELS: Record<ConfiguratorStep, string> = {
  "org-type": "Organisation",
  vertical: "Setting",
  included: "Included",
  modules: "Modules",
  plan: "Plan",
  storage: "Storage",
  summary: "Summary",
};

const EMPTY_ACCOUNT_DETAILS: AccountDetails = {
  organisationName: "",
  contactName: "",
  workEmail: "",
  password: "",
};

function buildRedirectUrl(path: string): string | null {
  if (typeof window === "undefined" || !window.location) return null;

  return new URL(path, window.location.href).toString();
}

function configuratorReducer(
  state: ConfiguratorState,
  action: ConfiguratorAction,
): ConfiguratorState {
  switch (action.type) {
    case "next":
      return nextStep(state);
    case "back":
      return prevStep(state);
    case "org-type":
      return selectOrgType(state, action.orgType);
    case "vertical":
      return selectVertical(state, action.vertical);
    case "module":
      return toggleModule(state, action.module);
    case "plan":
      return selectPlan(state, action.planCode);
    case "frequency":
      return selectFrequency(state, action.frequency, action.prices);
    case "storage":
      return selectStorage(state, action.storageChoice);
  }
}

function isContinueDisabled(
  state: ConfiguratorState,
  currentStep: ConfiguratorStep,
): boolean {
  return (
    currentStep === "summary" ||
    (currentStep === "org-type" && !state.orgType) ||
    (currentStep === "vertical" && !state.vertical) ||
    (currentStep === "plan" && !state.planCode)
  );
}

export default function ConfigurePage() {
  const [state, dispatch] = useReducer(
    configuratorReducer,
    INITIAL_CONFIGURATOR_STATE,
  );
  const [accountDetails, setAccountDetails] = useState<AccountDetails>(
    EMPTY_ACCOUNT_DETAILS,
  );
  const [billingPrices, setBillingPrices] = useState(() =>
    mergeBillingPrices([]),
  );
  const [pricingWarning, setPricingWarning] = useState<string | null>(null);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [isCheckoutPending, setIsCheckoutPending] = useState(false);
  const checkoutInFlightRef = useRef(false);
  const [stepDirection, setStepDirection] = useState<StepDirection>("forward");
  const prefersReducedMotion = useReducedMotion();
  const currentStep = firstIncompleteStep(state);

  useEffect(() => {
    const controller = new AbortController();
    const loadPrices = async () => {
      try {
        const response = await fetchPublicBillingPrices();
        if (!controller.signal.aborted && response.prices.length) {
          setBillingPrices(mergeBillingPrices(response.prices));
        }
      } catch {
        if (!controller.signal.aborted)
          setPricingWarning(
            "Live pricing could not be loaded. Showing our current published prices.",
          );
      }
    };
    void loadPrices();
    return () => controller.abort();
  }, []);

  const mergedPlanPrices = useMemo(
    () => ({ ...PLAN_PRICES, ...billingPrices.planPrices }),
    [billingPrices.planPrices],
  );
  const mergedAddonPrices = useMemo(
    () => ({ ...ADDON_PRICES, ...billingPrices.addonPrices }),
    [billingPrices.addonPrices],
  );
  const optionPrices = useMemo<OptionPriceLookup>(
    () => ({
      ...ADDON_PRICES,
      ...billingPrices.addonPrices,
      ...billingPrices.modulePrices,
    }),
    [billingPrices.addonPrices, billingPrices.modulePrices],
  );
  const progressSteps: ConfiguratorProgressStep[] = progressStepsForOrgType(
    state.orgType,
  ).map((step) => ({ id: step, label: STEP_LABELS[step] }));
  const stepVariants = prefersReducedMotion
    ? reducedStepVariants
    : configuratorStepVariants;
  const handleCheckout = async () => {
    if (checkoutInFlightRef.current) return;
    checkoutInFlightRef.current = true;
    setCheckoutError(null);
    setIsCheckoutPending(true);

    try {
      const successUrl = buildRedirectUrl("/buy/thanks");
      const cancelUrl = buildRedirectUrl("/buy/cancelled");
      if (!successUrl || !cancelUrl) {
        setCheckoutError(
          "Unable to determine redirect URLs; please try again in the browser.",
        );
        return;
      }

      const { sessionUrl } = await createCheckoutSession(
        buildCheckoutPayload(state, {
          ...accountDetails,
          successUrl,
          cancelUrl,
        }),
      );
      window.location.href = sessionUrl;
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "We couldn’t start checkout. Please try again.",
      );
    } finally {
      setIsCheckoutPending(false);
      checkoutInFlightRef.current = false;
    }
  };

  return (
    <main className="bg-shell py-10 sm:py-14">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[minmax(0,1fr),minmax(400px,44%)] lg:px-8">
        <section className="max-w-xl space-y-8">
          <header className="space-y-3">
            <p className="text-sm font-semibold text-accent-strong">
              Configure Pathway
            </p>
            <h1 className="font-heading text-3xl font-bold text-text-primary sm:text-4xl">
              Build the right workspace for your organisation.
            </h1>
          </header>
          {pricingWarning ? (
            <p
              role="status"
              className="rounded-lg bg-status-warn/10 px-4 py-3 text-sm text-text-primary"
            >
              {pricingWarning}
            </p>
          ) : null}
          <ConfiguratorStepper
            steps={progressSteps}
            currentStep={currentStep}
            onBack={() => {
              if (isCheckoutPending || checkoutInFlightRef.current) return;
              setStepDirection("back");
              dispatch({ type: "back" });
            }}
            onContinue={() => {
              setStepDirection("forward");
              dispatch({ type: "next" });
            }}
            isBackDisabled={currentStep === "org-type" || isCheckoutPending}
            isContinueDisabled={isContinueDisabled(state, currentStep)}
          />
        </section>
        <aside className="sticky top-2 z-10 grid h-fit grid-cols-[minmax(0,1.4fr),minmax(0,1fr)] gap-3 lg:sticky lg:top-24 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:block lg:space-y-6">
          <ConfiguratorStage state={state} />
          <div className="rounded-2xl bg-muted p-4 shadow-card lg:p-6">
            <RunningTotal
              state={state}
              planPrices={mergedPlanPrices}
              addonPrices={mergedAddonPrices}
              modulePrices={billingPrices.modulePrices}
              showEntitlementPreview={currentStep === "summary"}
              compact
            />
          </div>
        </aside>
        <section className="max-w-xl lg:col-start-1 lg:row-start-2">
          <AnimatePresence
            mode="wait"
            initial={!prefersReducedMotion}
            custom={stepDirection}
          >
            <motion.div
              key={currentStep}
              custom={stepDirection}
              variants={stepVariants}
              initial="initial"
              animate="animate"
              exit="exit"
            >
              {currentStep === "org-type" ? (
                <OrgTypeStep
                  orgType={state.orgType}
                  onSelect={(orgType) =>
                    dispatch({ type: "org-type", orgType })
                  }
                />
              ) : null}
              {currentStep === "vertical" && state.orgType ? (
                <VerticalStep
                  orgType={state.orgType}
                  vertical={state.vertical}
                  onSelect={(vertical) =>
                    dispatch({ type: "vertical", vertical })
                  }
                />
              ) : null}
              {currentStep === "included" && state.vertical ? (
                <IncludedStep vertical={state.vertical} />
              ) : null}
              {currentStep === "modules" ? (
                <ModulesStep
                  selectedModules={state.selectedModules}
                  frequency={state.frequency}
                  prices={optionPrices}
                  onToggle={(module) => dispatch({ type: "module", module })}
                />
              ) : null}
              {currentStep === "plan" ? (
                <PlanStep
                  planCode={state.planCode}
                  frequency={state.frequency}
                  planPrices={mergedPlanPrices}
                  onSelectPlan={(planCode) =>
                    dispatch({ type: "plan", planCode })
                  }
                  onSelectFrequency={(frequency) =>
                    dispatch({
                      type: "frequency",
                      frequency,
                      prices: optionPrices,
                    })
                  }
                />
              ) : null}
              {currentStep === "storage" ? (
                <StorageStep
                  storageChoice={state.storageChoice}
                  frequency={state.frequency}
                  prices={optionPrices}
                  onSelect={(storageChoice) =>
                    dispatch({ type: "storage", storageChoice })
                  }
                />
              ) : null}
              {currentStep === "summary" && state.vertical && state.planCode ? (
                <SummaryStep
                  vertical={state.vertical}
                  selectedModules={state.selectedModules}
                  planCode={state.planCode}
                  frequency={state.frequency}
                  storageChoice={state.storageChoice}
                  accountDetails={accountDetails}
                  onAccountDetailsChange={setAccountDetails}
                  onCheckout={handleCheckout}
                  isCheckoutPending={isCheckoutPending}
                  checkoutError={checkoutError}
                />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </section>
      </div>
    </main>
  );
}
