const MIN_STAGE = 1;
const MAX_STAGE = 3;

export type DemeritStageAction =
  | "none"
  | "review"
  | "notify"
  | "head-review";

export interface DemeritPolicyInput {
  demeritUnits: number;
  stageOneThreshold: number;
  stageTwoThreshold: number;
  stageThreeThreshold: number;
  seriousMisconductStage: number;
  hasSeriousMisconduct: boolean;
  manualStage?: number;
}

export interface DemeritStageResult {
  stage: number;
  action: DemeritStageAction;
  requiresNote: boolean;
}

/**
 * Evaluates the current demerit stage from policy-classified values.
 * Callers filter demerit units to the policy window before invoking it.
 */
export function evaluateDemeritStage(
  input: DemeritPolicyInput,
): DemeritStageResult {
  assertInput(input);

  const stage = Math.max(
    stageFromDemeritUnits(input),
    input.manualStage ?? 0,
    input.hasSeriousMisconduct ? input.seriousMisconductStage : 0,
  );
  const requiresNote = input.hasSeriousMisconduct || stage === MAX_STAGE;

  return {
    stage,
    action: input.hasSeriousMisconduct ? "head-review" : actionForStage(stage),
    requiresNote,
  };
}

function stageFromDemeritUnits(input: DemeritPolicyInput): number {
  if (input.demeritUnits >= input.stageThreeThreshold) return 3;
  if (input.demeritUnits >= input.stageTwoThreshold) return 2;
  if (input.demeritUnits >= input.stageOneThreshold) return 1;
  return 0;
}

function actionForStage(stage: number): DemeritStageAction {
  if (stage === 3) return "head-review";
  if (stage === 2) return "notify";
  if (stage === 1) return "review";
  return "none";
}

function assertInput(input: DemeritPolicyInput): void {
  if (!Number.isInteger(input.demeritUnits) || input.demeritUnits < 0) {
    throw new RangeError("Demerit units must be a non-negative integer.");
  }

  if (
    !Number.isInteger(input.stageOneThreshold) ||
    !Number.isInteger(input.stageTwoThreshold) ||
    !Number.isInteger(input.stageThreeThreshold) ||
    input.stageOneThreshold <= 0 ||
    input.stageTwoThreshold <= input.stageOneThreshold ||
    input.stageThreeThreshold <= input.stageTwoThreshold
  ) {
    throw new RangeError(
      "Demerit stage thresholds must be positive integers in ascending order.",
    );
  }

  assertStage(input.seriousMisconductStage, "Serious misconduct stage");

  if (input.manualStage !== undefined) {
    assertStage(input.manualStage, "Manual demerit stage");
  }
}

function assertStage(stage: number, label: string): void {
  if (
    !Number.isInteger(stage) ||
    stage < MIN_STAGE ||
    stage > MAX_STAGE
  ) {
    throw new RangeError(`${label} must be an integer between 1 and 3.`);
  }
}
