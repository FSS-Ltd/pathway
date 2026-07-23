import { getConfiguratorPlanPolicy } from "@pathway/pricing";
import { PLAN_PRICES, type PlanCode } from "../../../lib/configurator-pricing";
import {
  optionDelta,
  type OptionPriceLookup,
  type WebModule,
} from "../../../lib/module-catalog";

// Admin-side configurator: an authenticated existing org upgrading its plan and
// buying add-ons. The public web configurator (apps/web/app/configure) also
// chooses org type + vertical and creates a new org; here those are already
// fixed, so the flow is trimmed to plan -> modules -> storage -> summary.

export type ConfiguratorStep = "plan" | "modules" | "storage" | "summary";

export type ConfiguratorState = {
  step: ConfiguratorStep;
  planCode: PlanCode | null;
  frequency: "monthly" | "yearly";
  selectedOptionalModules: WebModule[];
  storageChoice: "none" | "100" | "200" | "1000";
};

export const PROGRESS_STEPS: ConfiguratorStep[] = ["plan", "modules", "storage"];

export const INITIAL_CONFIGURATOR_STATE: ConfiguratorState = {
  step: "plan",
  planCode: null,
  frequency: "monthly",
  selectedOptionalModules: [],
  storageChoice: "none",
};

/** True when the code is one of the configurator's purchasable plan codes. */
export function isConfiguratorPlanCode(
  planCode: string | null | undefined,
): planCode is PlanCode {
  return Boolean(planCode) && Object.hasOwn(PLAN_PRICES, planCode as string);
}

/**
 * Seed the configurator from the org's current subscription so the current plan
 * is preselected and the delta is meaningful. Legacy/unknown plan codes (which
 * the configurator doesn't sell) leave the plan unselected.
 */
export function initialStateFromSubscription(
  planCode: string | null | undefined,
): ConfiguratorState {
  if (!isConfiguratorPlanCode(planCode)) return INITIAL_CONFIGURATOR_STATE;
  return {
    ...INITIAL_CONFIGURATOR_STATE,
    planCode,
    frequency: planCode.endsWith("YEARLY") ? "yearly" : "monthly",
  };
}

export function includedModulesForState(state: ConfiguratorState): WebModule[] {
  return state.planCode
    ? [...(getConfiguratorPlanPolicy(state.planCode)?.includedModules ?? [])]
    : [];
}

export function configuredModulesForState(
  state: ConfiguratorState,
): WebModule[] {
  return [
    ...new Set([
      ...includedModulesForState(state),
      ...state.selectedOptionalModules,
    ]),
  ];
}

function reconcileOptionalModules(
  modules: readonly WebModule[],
  planCode: PlanCode | null,
  frequency: ConfiguratorState["frequency"],
  prices: OptionPriceLookup,
): WebModule[] {
  const policy = planCode ? getConfiguratorPlanPolicy(planCode) : undefined;
  if (!policy || policy.outcome !== "checkout") return [];

  return [...new Set(modules)].filter(
    (module) =>
      policy.eligibleOptionalModules.includes(module) &&
      optionDelta({ kind: "module", module }, frequency, prices).status ===
        "priced",
  );
}

export function firstIncompleteStep(
  state: ConfiguratorState,
): ConfiguratorStep {
  if (!state.planCode) return "plan";
  return state.step;
}

export function nextStep(state: ConfiguratorState): ConfiguratorState {
  const guardedStep = firstIncompleteStep(state);
  if (guardedStep !== state.step) return { ...state, step: guardedStep };

  switch (state.step) {
    case "plan":
      return state.planCode ? { ...state, step: "modules" } : state;
    case "modules":
      return { ...state, step: "storage" };
    case "storage":
      return { ...state, step: "summary" };
    case "summary":
      return state;
  }
}

export function prevStep(state: ConfiguratorState): ConfiguratorState {
  const guardedStep = firstIncompleteStep(state);
  if (guardedStep !== state.step) return { ...state, step: guardedStep };

  switch (state.step) {
    case "plan":
      return state;
    case "modules":
      return { ...state, step: "plan" };
    case "storage":
      return { ...state, step: "modules" };
    case "summary":
      return { ...state, step: "storage" };
  }
}

export function toggleModule(
  state: ConfiguratorState,
  module: WebModule,
  prices: OptionPriceLookup,
): ConfiguratorState {
  const policy = state.planCode
    ? getConfiguratorPlanPolicy(state.planCode)
    : undefined;
  if (
    !policy ||
    policy.outcome !== "checkout" ||
    !policy.eligibleOptionalModules.includes(module) ||
    optionDelta({ kind: "module", module }, state.frequency, prices).status !==
      "priced"
  )
    return state;

  const selectedOptionalModules = state.selectedOptionalModules.includes(module)
    ? state.selectedOptionalModules.filter((selected) => selected !== module)
    : [...state.selectedOptionalModules, module];
  return { ...state, selectedOptionalModules };
}

export function selectPlan(
  state: ConfiguratorState,
  planCode: PlanCode,
  prices: OptionPriceLookup,
): ConfiguratorState {
  const previouslyIncluded = new Set(includedModulesForState(state));
  return {
    ...state,
    planCode,
    selectedOptionalModules: reconcileOptionalModules(
      state.selectedOptionalModules.filter(
        (module) => !previouslyIncluded.has(module),
      ),
      planCode,
      state.frequency,
      prices,
    ),
  };
}

export function selectFrequency(
  state: ConfiguratorState,
  frequency: ConfiguratorState["frequency"],
  prices: OptionPriceLookup,
): ConfiguratorState {
  const planCode = state.planCode
    ? remapPlanFrequency(state.planCode, frequency)
    : null;
  return {
    ...state,
    frequency,
    planCode,
    selectedOptionalModules: reconcileOptionalModules(
      state.selectedOptionalModules,
      planCode,
      frequency,
      prices,
    ),
  };
}

export function selectStorage(
  state: ConfiguratorState,
  storageChoice: ConfiguratorState["storageChoice"],
): ConfiguratorState {
  return { ...state, storageChoice };
}

function remapPlanFrequency(
  planCode: PlanCode,
  frequency: ConfiguratorState["frequency"],
): PlanCode {
  const planCodes: Record<
    PlanCode,
    Record<ConfiguratorState["frequency"], PlanCode>
  > = {
    STARTER_49_MONTHLY: {
      monthly: "STARTER_49_MONTHLY",
      yearly: "STARTER_49_YEARLY",
    },
    STARTER_49_YEARLY: {
      monthly: "STARTER_49_MONTHLY",
      yearly: "STARTER_49_YEARLY",
    },
    GROWTH_99_MONTHLY: {
      monthly: "GROWTH_99_MONTHLY",
      yearly: "GROWTH_99_YEARLY",
    },
    GROWTH_99_YEARLY: {
      monthly: "GROWTH_99_MONTHLY",
      yearly: "GROWTH_99_YEARLY",
    },
    PROFESSIONAL_149_MONTHLY: {
      monthly: "PROFESSIONAL_149_MONTHLY",
      yearly: "PROFESSIONAL_149_YEARLY",
    },
    PROFESSIONAL_149_YEARLY: {
      monthly: "PROFESSIONAL_149_MONTHLY",
      yearly: "PROFESSIONAL_149_YEARLY",
    },
  };
  return planCodes[planCode][frequency];
}
