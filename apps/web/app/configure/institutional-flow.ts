import type {
  InstitutionalMappedPlanCode,
  InstitutionalStorageChoice,
} from "@pathway/pricing";

export type InstitutionalStep =
  | "plan"
  | "organisation"
  | "setting"
  | "pupils"
  | "included"
  | "modules"
  | "storage"
  | "summary";

export type InstitutionalConfiguration = {
  step: InstitutionalStep;
  planCode: InstitutionalMappedPlanCode;
  orgType: "SCHOOL" | "CHURCH" | "CHARITY" | "CLUB" | "NURSERY" | null;
  setting:
    | "CHURCH"
    | "INDEPENDENT_SCHOOL"
    | "ACE_SCHOOL"
    | "STATE_SCHOOL"
    | "NURSERY"
    | "CHARITY"
    | "CLUB"
    | null;
  countInput: string;
  declarationAccepted: boolean;
  storageChoice: InstitutionalStorageChoice;
};

export const INITIAL_CONFIGURATION: InstitutionalConfiguration = {
  step: "plan",
  planCode: "INSTITUTIONAL_STARTER_MONTHLY",
  orgType: null,
  setting: null,
  countInput: "",
  declarationAccepted: false,
  storageChoice: "none",
};

export const STEP_LABELS: Record<InstitutionalStep, string> = {
  plan: "Plan and period",
  organisation: "Organisation",
  setting: "Setting",
  pupils: "Pupils",
  included: "Included features",
  modules: "Modules",
  storage: "Storage",
  summary: "Summary",
};

export function stepsFor(
  orgType: InstitutionalConfiguration["orgType"],
): InstitutionalStep[] {
  return orgType && orgType !== "SCHOOL"
    ? [
        "plan",
        "organisation",
        "pupils",
        "included",
        "modules",
        "storage",
        "summary",
      ]
    : [
        "plan",
        "organisation",
        "setting",
        "pupils",
        "included",
        "modules",
        "storage",
        "summary",
      ];
}

export function enrolledCount(input: string): number | null {
  if (input.trim() === "") return null;
  const count = Number(input);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export function nextStep(
  configuration: InstitutionalConfiguration,
): InstitutionalStep {
  const steps = stepsFor(configuration.orgType);
  return steps[
    Math.min(steps.indexOf(configuration.step) + 1, steps.length - 1)
  ];
}

export function previousStep(
  configuration: InstitutionalConfiguration,
): InstitutionalStep {
  const steps = stepsFor(configuration.orgType);
  return steps[Math.max(steps.indexOf(configuration.step) - 1, 0)];
}
