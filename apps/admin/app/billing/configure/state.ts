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
  selectedIncludedModules: WebModule[];
  storageChoice: "none" | "100" | "200" | "1000";
};

export const PROGRESS_STEPS: ConfiguratorStep[] = [
  "plan",
  "modules",
  "storage",
];

export const INITIAL_CONFIGURATOR_STATE: ConfiguratorState = {
  step: "plan",
  planCode: null,
  frequency: "monthly",
  selectedOptionalModules: [],
  selectedIncludedModules: [],
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
  modules: { included: readonly WebModule[]; paid: readonly WebModule[] } = {
    included: [],
    paid: [],
  },
): ConfiguratorState {
  if (!isConfiguratorPlanCode(planCode)) return INITIAL_CONFIGURATOR_STATE;
  const policy = getConfiguratorPlanPolicy(planCode);
  const included = [...new Set(modules.included)]
    .filter((module) => policy?.eligibleOptionalModules.includes(module))
    .slice(0, policy?.includedModuleLimit ?? 0);
  const includedSet = new Set(included);
  const paid = [...new Set(modules.paid)].filter(
    (module) =>
      !includedSet.has(module) &&
      policy?.eligibleOptionalModules.includes(module),
  );
  return {
    ...INITIAL_CONFIGURATOR_STATE,
    planCode,
    frequency: planCode.endsWith("YEARLY") ? "yearly" : "monthly",
    selectedIncludedModules: included,
    selectedOptionalModules: paid,
  };
}

export function includedModulesForState(state: ConfiguratorState): WebModule[] {
  return state.selectedIncludedModules;
}

export function includedModuleLimitForState(state: ConfiguratorState): number {
  return state.planCode
    ? (getConfiguratorPlanPolicy(state.planCode)?.includedModuleLimit ?? 0)
    : 0;
}

export function configuredModulesForState(
  state: ConfiguratorState,
): WebModule[] {
  return [
    ...new Set([
      ...state.selectedIncludedModules,
      ...state.selectedOptionalModules,
    ]),
  ];
}

function reconcileModules(
  modules: readonly WebModule[],
  planCode: PlanCode | null,
  frequency: ConfiguratorState["frequency"],
  prices: OptionPriceLookup,
): { included: WebModule[]; optional: WebModule[] } {
  const policy = planCode ? getConfiguratorPlanPolicy(planCode) : undefined;
  if (!policy || policy.outcome !== "checkout") {
    return { included: [], optional: [] };
  }

  const selectedModules = [...new Set(modules)].filter((module) =>
    policy.eligibleOptionalModules.includes(module),
  );
  return {
    included: selectedModules.slice(0, policy.includedModuleLimit),
    optional: selectedModules
      .slice(policy.includedModuleLimit)
      .filter(
        (module) =>
          optionDelta({ kind: "module", module }, frequency, prices).status ===
          "priced",
      ),
  };
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
    !policy.eligibleOptionalModules.includes(module)
  ) {
    return state;
  }

  const selectedIncluded = state.selectedIncludedModules.includes(module);
  const selectedOptional = state.selectedOptionalModules.includes(module);
  if (
    selectedOptional &&
    state.selectedIncludedModules.length < policy.includedModuleLimit
  ) {
    return {
      ...state,
      selectedIncludedModules: [...state.selectedIncludedModules, module],
      selectedOptionalModules: state.selectedOptionalModules.filter(
        (item) => item !== module,
      ),
    };
  }
  const selectedModules = [
    ...state.selectedIncludedModules,
    ...state.selectedOptionalModules,
  ];
  if (selectedIncluded || selectedOptional) {
    const reconciled = reconcileModules(
      selectedModules.filter((selected) => selected !== module),
      state.planCode,
      state.frequency,
      prices,
    );
    return {
      ...state,
      selectedIncludedModules: reconciled.included,
      selectedOptionalModules: reconciled.optional,
    };
  }

  if (state.selectedIncludedModules.length < policy.includedModuleLimit) {
    return {
      ...state,
      selectedIncludedModules: [...state.selectedIncludedModules, module],
    };
  }
  if (
    optionDelta({ kind: "module", module }, state.frequency, prices).status !==
    "priced"
  ) {
    return state;
  }
  return {
    ...state,
    selectedOptionalModules: [...state.selectedOptionalModules, module],
  };
}

export function selectPlan(
  state: ConfiguratorState,
  planCode: PlanCode,
  prices: OptionPriceLookup,
): ConfiguratorState {
  const reconciled = reconcileModules(
    [...state.selectedIncludedModules, ...state.selectedOptionalModules],
    planCode,
    state.frequency,
    prices,
  );

  return {
    ...state,
    planCode,
    selectedIncludedModules: reconciled.included,
    selectedOptionalModules: reconciled.optional,
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
  const reconciled = reconcileModules(
    [...state.selectedIncludedModules, ...state.selectedOptionalModules],
    planCode,
    frequency,
    prices,
  );

  return {
    ...state,
    frequency,
    planCode,
    selectedIncludedModules: reconciled.included,
    selectedOptionalModules: reconciled.optional,
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
