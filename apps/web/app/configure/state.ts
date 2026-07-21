import type { Vertical } from "@pathway/types";
import type { PlanCode } from "../../lib/buy-now-pricing";
import {
  optionDelta,
  type OptionPriceLookup,
  type WebModule,
} from "../../lib/module-catalog";

export type OrgType = "SCHOOL" | "CHURCH" | "CHARITY" | "CLUB" | "NURSERY";

export type ConfiguratorStep =
  | "org-type"
  | "vertical"
  | "included"
  | "modules"
  | "plan"
  | "storage"
  | "summary";

export type ConfiguratorState = {
  step: ConfiguratorStep;
  orgType: OrgType | null;
  vertical: Vertical | null;
  selectedModules: WebModule[];
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
  "org-type",
  "vertical",
  "included",
  "modules",
  "plan",
  "storage",
];

const PROGRESS_STEPS_WITHOUT_VERTICAL: ConfiguratorStep[] = [
  "org-type",
  "included",
  "modules",
  "plan",
  "storage",
];

const SCREEN_STEPS: ConfiguratorStep[] = [
  ...PROGRESS_STEPS_WITH_VERTICAL,
  "summary",
];

export const INITIAL_CONFIGURATOR_STATE: ConfiguratorState = {
  step: "org-type",
  orgType: null,
  vertical: null,
  selectedModules: [],
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
    ...(orgType === null || orgType === "SCHOOL"
      ? PROGRESS_STEPS_WITH_VERTICAL
      : PROGRESS_STEPS_WITHOUT_VERTICAL),
  ];
}

export function firstIncompleteStep(
  state: ConfiguratorState,
): ConfiguratorStep {
  if (!state.orgType) return "org-type";

  const stepIndex = SCREEN_STEPS.indexOf(state.step);
  const verticalIndex = SCREEN_STEPS.indexOf("vertical");
  const planIndex = SCREEN_STEPS.indexOf("plan");

  if (!state.vertical && stepIndex > verticalIndex) return "vertical";
  if (!state.planCode && stepIndex > planIndex) return "plan";

  return state.step;
}

export function nextStep(state: ConfiguratorState): ConfiguratorState {
  const guardedStep = firstIncompleteStep(state);
  if (guardedStep !== state.step) return { ...state, step: guardedStep };

  switch (state.step) {
    case "org-type": {
      if (!state.orgType) return state;

      const verticals = verticalsForOrgType(state.orgType);
      if (verticals.length === 1) {
        return { ...state, step: "included", vertical: verticals[0] };
      }

      return { ...state, step: "vertical" };
    }
    case "vertical":
      return state.vertical ? { ...state, step: "included" } : state;
    case "included":
      return { ...state, step: "modules" };
    case "modules":
      return { ...state, step: "plan" };
    case "plan":
      return state.planCode ? { ...state, step: "storage" } : state;
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
    case "org-type":
      return state;
    case "vertical":
      return { ...state, step: "org-type" };
    case "included":
      return {
        ...state,
        step: state.orgType === "SCHOOL" ? "vertical" : "org-type",
      };
    case "modules":
      return { ...state, step: "included" };
    case "plan":
      return { ...state, step: "modules" };
    case "storage":
      return { ...state, step: "plan" };
    case "summary":
      return { ...state, step: "storage" };
  }
}

export function selectOrgType(
  state: ConfiguratorState,
  orgType: OrgType,
): ConfiguratorState {
  const validVerticals = verticalsForOrgType(orgType);
  return {
    ...state,
    orgType,
    vertical:
      state.vertical && validVerticals.includes(state.vertical)
        ? state.vertical
        : null,
  };
}

export function selectVertical(
  state: ConfiguratorState,
  vertical: Vertical,
): ConfiguratorState {
  if (
    !state.orgType ||
    !verticalsForOrgType(state.orgType).includes(vertical)
  ) {
    return state;
  }
  return { ...state, vertical };
}

export function toggleModule(
  state: ConfiguratorState,
  module: WebModule,
): ConfiguratorState {
  const selectedModules = state.selectedModules.includes(module)
    ? state.selectedModules.filter((selected) => selected !== module)
    : [...state.selectedModules, module];
  return { ...state, selectedModules };
}

export function selectPlan(
  state: ConfiguratorState,
  planCode: PlanCode,
): ConfiguratorState {
  return { ...state, planCode };
}

export function selectFrequency(
  state: ConfiguratorState,
  frequency: ConfiguratorState["frequency"],
  prices: OptionPriceLookup,
): ConfiguratorState {
  const planCode = state.planCode
    ? remapPlanFrequency(state.planCode, frequency)
    : null;
  const selectedModules = state.selectedModules.filter(
    (module) =>
      optionDelta({ kind: "module", module }, frequency, prices).status ===
      "priced",
  );
  return { ...state, frequency, planCode, selectedModules };
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
