import type { Vertical } from "@pathway/types";
import type { PlanCode } from "../../lib/buy-now-pricing";
import type { WebModule } from "../../lib/module-catalog";

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
