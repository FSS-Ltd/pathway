import { getConfiguratorPlanPolicy } from "@pathway/pricing";
import type { Vertical } from "@pathway/types";
import type { PlanCode } from "../../lib/buy-now-pricing";
import {
  optionDelta,
  type OptionPriceLookup,
  type WebModule,
} from "../../lib/module-catalog";

export type OrgType = "SCHOOL" | "CHURCH" | "CHARITY" | "CLUB" | "NURSERY";

export type ConfiguratorStep =
  | "plan"
  | "org-type"
  | "vertical"
  | "included"
  | "modules"
  | "storage"
  | "summary";

export type ConfiguratorState = {
  step: ConfiguratorStep;
  orgType: OrgType | null;
  vertical: Vertical | null;
  selectedOptionalModules: WebModule[];
  selectedIncludedModules: WebModule[];
  planCode: PlanCode | null;
  frequency: "monthly" | "yearly";
  storageChoice: "none" | "100" | "200" | "1000";
};

const VERTICALS_BY_ORG_TYPE: Record<OrgType, Vertical[]> = {
  SCHOOL: ["INDEPENDENT_SCHOOL", "ACE_SCHOOL", "STATE_SCHOOL"],
  CHURCH: ["CHURCH"],
  CHARITY: ["CHARITY"],
  CLUB: ["CLUB"],
  NURSERY: ["NURSERY"],
};

const PROGRESS_STEPS_WITH_VERTICAL: ConfiguratorStep[] = [
  "plan",
  "org-type",
  "vertical",
  "included",
  "modules",
  "storage",
];
const PROGRESS_STEPS_WITHOUT_VERTICAL: ConfiguratorStep[] = [
  "plan",
  "org-type",
  "included",
  "modules",
  "storage",
];
export const INITIAL_CONFIGURATOR_STATE: ConfiguratorState = {
  step: "plan",
  orgType: null,
  vertical: null,
  selectedOptionalModules: [],
  selectedIncludedModules: [],
  planCode: null,
  frequency: "monthly",
  storageChoice: "none",
};

export function verticalsForOrgType(orgType: OrgType): Vertical[] {
  return [...VERTICALS_BY_ORG_TYPE[orgType]];
}

export function progressStepsForOrgType(
  orgType: OrgType | null,
): ConfiguratorStep[] {
  return [
    ...(orgType === "SCHOOL" || orgType === null
      ? PROGRESS_STEPS_WITH_VERTICAL
      : PROGRESS_STEPS_WITHOUT_VERTICAL),
  ];
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
  if (state.step === "plan") return "plan";
  if (!state.orgType) return "org-type";
  if (state.step === "org-type") return "org-type";
  if (state.orgType === "SCHOOL" && !state.vertical) return "vertical";
  return state.step;
}

export function nextStep(state: ConfiguratorState): ConfiguratorState {
  const guardedStep = firstIncompleteStep(state);
  if (guardedStep !== state.step) return { ...state, step: guardedStep };

  switch (state.step) {
    case "plan":
      return state.planCode ? { ...state, step: "org-type" } : state;
    case "org-type":
      if (!state.orgType) return state;
      return state.orgType === "SCHOOL"
        ? { ...state, step: "vertical" }
        : { ...state, step: "included" };
    case "vertical":
      return state.vertical ? { ...state, step: "included" } : state;
    case "included":
      return { ...state, step: "modules" };
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
    case "org-type":
      return { ...state, step: "plan" };
    case "vertical":
      return { ...state, step: "org-type" };
    case "included":
      return {
        ...state,
        step: state.orgType === "SCHOOL" ? "vertical" : "org-type",
      };
    case "modules":
      return { ...state, step: "included" };
    case "storage":
      return { ...state, step: "modules" };
    case "summary":
      return { ...state, step: "storage" };
  }
}

export function selectOrgType(
  state: ConfiguratorState,
  orgType: OrgType,
): ConfiguratorState {
  const verticals = verticalsForOrgType(orgType);
  return {
    ...state,
    orgType,
    vertical: verticals.length === 1 ? verticals[0] : null,
  };
}

export function selectVertical(
  state: ConfiguratorState,
  vertical: Vertical,
): ConfiguratorState {
  return state.orgType && verticalsForOrgType(state.orgType).includes(vertical)
    ? { ...state, vertical }
    : state;
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
  const selectedModules = [
    ...state.selectedIncludedModules,
    ...state.selectedOptionalModules,
  ];
  const reconciled = reconcileModules(
    selectedModules,
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
