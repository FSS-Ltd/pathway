import {
  comparePaceNumbers,
  nextPaceNumber,
  type PaceNumber,
} from "./pace-number";

export type PaceAssessmentType = "SelfTest" | "FinalTest";

export type PacePolicyCode =
  | "allowed"
  | "score-below-threshold"
  | "daily-limit"
  | "duplicate-self-test"
  | "same-pace-same-day"
  | "progression-blocked"
  | "override-required";

export interface PacePolicyResult {
  decision: "allow" | "warn" | "block";
  code: PacePolicyCode;
  nextPace?: PaceNumber;
}

export interface PaceAssessmentPolicyInput {
  assessmentType: PaceAssessmentType;
  score: number;
  passThreshold: number;
  assessedPace: PaceNumber;
  currentPace: PaceNumber;
  dailyTestCount: number;
  dailyTestLimitEnabled: boolean;
  dailyTestLimit: number;
  samePaceSameDayBlockEnabled: boolean;
  hasExistingSelfTest: boolean;
  hasRequiredSelfTest: boolean;
  hasOppositeTypeAssessmentOnSameDay: boolean;
  hasAuthorisedOverride: boolean;
}

export function evaluatePaceAssessment(
  input: PaceAssessmentPolicyInput,
): PacePolicyResult {
  if (
    input.dailyTestLimitEnabled &&
    input.dailyTestCount >= input.dailyTestLimit
  ) {
    return { decision: "block", code: "daily-limit" };
  }

  if (input.assessmentType === "FinalTest" && !input.hasRequiredSelfTest) {
    return { decision: "block", code: "progression-blocked" };
  }

  if (input.assessmentType === "SelfTest" && input.hasExistingSelfTest) {
    return { decision: "block", code: "duplicate-self-test" };
  }

  if (
    input.samePaceSameDayBlockEnabled &&
    input.hasOppositeTypeAssessmentOnSameDay
  ) {
    return { decision: "block", code: "same-pace-same-day" };
  }

  if (input.assessmentType === "SelfTest") {
    return { decision: "allow", code: "allowed" };
  }

  const passesThreshold = input.score >= input.passThreshold;
  if (!passesThreshold && !input.hasAuthorisedOverride) {
    return { decision: "warn", code: "score-below-threshold" };
  }

  if (comparePaceNumbers(input.assessedPace, input.currentPace) < 0) {
    return { decision: "warn", code: "progression-blocked" };
  }

  if (isFinalPace(input.assessedPace)) {
    return { decision: "warn", code: "progression-blocked" };
  }

  return {
    decision: "allow",
    code: "allowed",
    nextPace: nextPaceNumber(input.assessedPace),
  };
}

function isFinalPace(pace: PaceNumber): boolean {
  return pace.raw === 144 || pace.raw === 1144;
}
