"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import {
  ADDON_PRICES,
  PLAN_PRICES,
  mergeBillingPrices,
  type PlanCode,
} from "../../lib/buy-now-pricing";
import { fetchPublicBillingPrices } from "../../lib/buy-now-client";
import type {
  OptionPriceLookup,
  StorageChoice,
  WebModule,
} from "../../lib/module-catalog";
import { RunningTotal } from "../../components/configurator/running-total";
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
            onBack={() => dispatch({ type: "back" })}
            onContinue={() => dispatch({ type: "next" })}
            isBackDisabled={currentStep === "org-type"}
            isContinueDisabled={isContinueDisabled(state, currentStep)}
          />
          {currentStep === "org-type" ? (
            <OrgTypeStep
              orgType={state.orgType}
              onSelect={(orgType) => dispatch({ type: "org-type", orgType })}
            />
          ) : null}
          {currentStep === "vertical" && state.orgType ? (
            <VerticalStep
              orgType={state.orgType}
              vertical={state.vertical}
              onSelect={(vertical) => dispatch({ type: "vertical", vertical })}
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
              onSelectPlan={(planCode) => dispatch({ type: "plan", planCode })}
              onSelectFrequency={(frequency) =>
                dispatch({ type: "frequency", frequency, prices: optionPrices })
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
            />
          ) : null}
        </section>
        <aside className="sticky top-24 h-fit rounded-2xl bg-muted p-6 shadow-card sm:p-8">
          <RunningTotal
            state={state}
            planPrices={mergedPlanPrices}
            addonPrices={mergedAddonPrices}
            modulePrices={billingPrices.modulePrices}
            showEntitlementPreview={currentStep === "summary"}
          />
        </aside>
      </div>
    </main>
  );
}
