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
