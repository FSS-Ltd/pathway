import {
  comparePaceNumbers,
  nextPaceNumber,
  parsePaceNumber,
  type PaceNumber,
} from "./pace-number";
import type { PaceAssessmentType } from "./pace-policy";

const MIN_ACE_LEVEL = 1;
const MAX_ACE_LEVEL = 12;
const UK_YEAR_OFFSET = 1;
const LOCAL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type PaceAssessmentResult = "passed" | "failed";

export interface PaceAssessmentFact {
  id: string;
  paceNumber: number;
  assessmentType: PaceAssessmentType;
  result: PaceAssessmentResult;
  assessedOn: string;
  correctsFactId?: string;
}

export interface PaceProgressFacts {
  assignedLevel: number;
  startingPace: number;
  assessmentFacts: readonly PaceAssessmentFact[];
}

export interface PaceLevel {
  level: number;
  ukYearTooltip: string;
}

export interface PaceProgressProjection {
  currentPace: PaceNumber;
  currentLevel: PaceLevel;
  assignedLevel: PaceLevel;
  levelDelta: number;
  needsAttention: boolean;
}

/**
 * Rebuilds a disposable PACE progress projection from immutable assessment
 * facts. Corrections replace their predecessor, leaving terminal facts only.
 */
export function rebuildPaceProgress(
  input: PaceProgressFacts,
): PaceProgressProjection {
  assertAceLevel(input.assignedLevel, "Assigned ACE level");
  const startingPace = parsePaceNumber(input.startingPace);
  const terminalFacts = getTerminalFacts(input.assessmentFacts);
  let currentPace = startingPace;

  for (const fact of terminalFacts) {
    if (
      fact.assessmentType === "FinalTest" &&
      fact.result === "passed" &&
      comparePaceNumbers(parsePaceNumber(fact.paceNumber), currentPace) === 0
    ) {
      currentPace = advanceOrComplete(currentPace);
    }
  }

  const currentLevel = toPaceLevel(currentPace.level);
  const assignedLevel = toPaceLevel(input.assignedLevel);
  const levelDelta = currentLevel.level - assignedLevel.level;

  return {
    currentPace,
    currentLevel,
    assignedLevel,
    levelDelta,
    needsAttention: levelDelta < 0,
  };
}

function getTerminalFacts(
  assessmentFacts: readonly PaceAssessmentFact[],
): PaceAssessmentFact[] {
  const factsById = new Map<string, PaceAssessmentFact>();
  const correctedFactIds = new Set<string>();

  for (const fact of assessmentFacts) {
    assertFact(fact);
    if (factsById.has(fact.id)) {
      throw new RangeError(
        `PACE assessment fact id '${fact.id}' is duplicated.`,
      );
    }
    factsById.set(fact.id, fact);
  }

  for (const fact of assessmentFacts) {
    if (fact.correctsFactId === undefined) continue;
    if (!factsById.has(fact.correctsFactId)) {
      throw new RangeError(
        `PACE assessment fact '${fact.id}' corrects an unknown fact '${fact.correctsFactId}'.`,
      );
    }
    if (fact.correctsFactId === fact.id) {
      throw new RangeError(
        `PACE assessment fact '${fact.id}' cannot correct itself.`,
      );
    }
    correctedFactIds.add(fact.correctsFactId);
  }

  assertAcyclicCorrectionLinks(factsById);

  return [...assessmentFacts]
    .filter((fact) => !correctedFactIds.has(fact.id))
    .sort(compareAssessmentFacts);
}

function assertAcyclicCorrectionLinks(
  factsById: ReadonlyMap<string, PaceAssessmentFact>,
): void {
  for (const fact of factsById.values()) {
    const seenFactIds = new Set<string>();
    let currentFact: PaceAssessmentFact | undefined = fact;

    while (currentFact?.correctsFactId !== undefined) {
      if (seenFactIds.has(currentFact.id)) {
        throw new RangeError(
          `PACE assessment fact '${fact.id}' has a cyclic correction link.`,
        );
      }
      seenFactIds.add(currentFact.id);
      currentFact = factsById.get(currentFact.correctsFactId);
    }
  }
}

function assertFact(fact: PaceAssessmentFact): void {
  if (typeof fact.id !== "string" || fact.id.trim() === "") {
    throw new RangeError("PACE assessment fact id must be a non-empty string.");
  }
  parsePaceNumber(fact.paceNumber);
  if (
    fact.assessmentType !== "SelfTest" &&
    fact.assessmentType !== "FinalTest"
  ) {
    throw new RangeError("PACE assessment fact assessmentType is invalid.");
  }
  if (fact.result !== "passed" && fact.result !== "failed") {
    throw new RangeError("PACE assessment fact result is invalid.");
  }
  if (!isLocalDate(fact.assessedOn)) {
    throw new RangeError(
      "PACE assessment fact assessedOn must be a local YYYY-MM-DD date.",
    );
  }
  if (
    fact.correctsFactId !== undefined &&
    (typeof fact.correctsFactId !== "string" ||
      fact.correctsFactId.trim() === "")
  ) {
    throw new RangeError(
      "PACE assessment fact correctsFactId must be a non-empty string when supplied.",
    );
  }
}

function compareAssessmentFacts(
  left: PaceAssessmentFact,
  right: PaceAssessmentFact,
): number {
  return (
    left.assessedOn.localeCompare(right.assessedOn) ||
    left.id.localeCompare(right.id)
  );
}

function advanceOrComplete(pace: PaceNumber): PaceNumber {
  try {
    return nextPaceNumber(pace);
  } catch (error) {
    if (error instanceof RangeError) return pace;
    throw error;
  }
}

function toPaceLevel(level: number): PaceLevel {
  assertAceLevel(level, "ACE level");
  const ukYear = level + UK_YEAR_OFFSET;

  return {
    level,
    ukYearTooltip: `UK Year ${ukYear} equivalent. This is not a placement recommendation.`,
  };
}

function assertAceLevel(level: number, label: string): void {
  if (
    !Number.isInteger(level) ||
    level < MIN_ACE_LEVEL ||
    level > MAX_ACE_LEVEL
  ) {
    throw new RangeError(`${label} must be an integer between 1 and 12.`);
  }
}

function isLocalDate(value: string): boolean {
  if (typeof value !== "string" || !LOCAL_DATE_PATTERN.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
