import { createHash } from "node:crypto";
import { BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import {
  comparePaceNumbers,
  parsePaceNumber,
  rebuildPaceProgress,
  type PaceAssessmentFact,
  type PaceAssessmentType,
  type PaceNumber,
  type PacePolicyResult,
} from "@pathway/ace-domain";
import type { Prisma } from "@pathway/db";
import type { CreatePaceAssessmentDto } from "./dto/create-pace-assessment.dto";

export type DatabaseAssessmentType = "SELF_TEST" | "PACE_TEST";
export type DatabaseAssessmentResult = "PASSED" | "FAILED";
export type DatabaseTrackStatus =
  | "AHEAD"
  | "ON_TRACK"
  | "AT_RISK"
  | "BEHIND"
  | "BLOCKED";

export interface AssessmentRecord {
  id: string;
  childId: string;
  subjectId: string;
  paceNumber: number;
  assessmentType: DatabaseAssessmentType;
  score: number;
  result: DatabaseAssessmentResult;
  assessedOn: Date;
  correctsAssessmentId: string | null;
  policyOverrideId: string | null;
  createdAt: Date;
  reason: string;
  recordedByUserId: string;
}

export interface ProgressRecord {
  currentPace: number;
  targetPace: number;
  completedPaces: number;
  trackStatus: DatabaseTrackStatus;
  blockCode: string | null;
  lastAssessmentId: string | null;
  rebuiltAt: Date;
}

export interface PaceCommandResponse {
  assessment: {
    id: string;
    childId: string;
    subjectId: string;
    paceNumber: number;
    assessmentType: PaceAssessmentType;
    score: number;
    result: "passed" | "failed";
    assessedOn: string;
  };
  progress: {
    currentPace: number;
    targetPace: number;
    completedPaces: number;
    trackStatus: DatabaseTrackStatus;
    blockCode: string | null;
    lastAssessmentId: string | null;
    rebuiltAt: string;
  };
  policy?: PacePolicyResult;
  duplicate: boolean;
}

export const assessmentSelect = {
  id: true,
  childId: true,
  subjectId: true,
  paceNumber: true,
  assessmentType: true,
  score: true,
  result: true,
  assessedOn: true,
  correctsAssessmentId: true,
  policyOverrideId: true,
  createdAt: true,
  reason: true,
  recordedByUserId: true,
} satisfies Prisma.PaceAssessmentSelect;

export const progressSelect = {
  currentPace: true,
  targetPace: true,
  completedPaces: true,
  trackStatus: true,
  blockCode: true,
  lastAssessmentId: true,
  rebuiltAt: true,
} satisfies Prisma.PaceProgressSelect;

export function policyBlocked(policyCode: string): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      code: "PACE_POLICY_BLOCKED",
      message: "The PACE assessment is blocked by site policy.",
      details: { policyCode },
    },
    HttpStatus.CONFLICT,
  );
}

export function idempotencyConflict(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      code: "PACE_IDEMPOTENCY_CONFLICT",
      message: "The idempotency key was already used for another command.",
    },
    HttpStatus.CONFLICT,
  );
}

export function assessmentConflict(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      code: "PACE_ASSESSMENT_CONFLICT",
      message: "An assessment already exists and requires a correction.",
    },
    HttpStatus.CONFLICT,
  );
}

export function policyOverrideInvalid(): HttpException {
  return new HttpException(
    {
      statusCode: HttpStatus.CONFLICT,
      code: "PACE_POLICY_OVERRIDE_INVALID",
      message: "The PACE policy override is unavailable for this assessment.",
    },
    HttpStatus.CONFLICT,
  );
}

export function commandIdempotencyScope(
  tenantId: string,
  clientKey: string,
): string {
  return `ace-pace-assessment:${tenantId}:${sha256(clientKey.trim())}`;
}

export function commandIdempotencyKey(
  scope: string,
  command: CreatePaceAssessmentDto,
  actorUserId: string,
  assessedOn: string,
): string {
  return `${scope}:${sha256(
    JSON.stringify({
      actorUserId,
      childId: command.childId,
      subjectId: command.subjectId,
      paceNumber: command.paceNumber,
      assessmentType: command.assessmentType,
      score: command.score,
      assessedAt: new Date(command.assessedAt).toISOString(),
      assessedOn,
      reason: command.reason.trim(),
      ...(command.policyOverrideId
        ? { policyOverrideId: command.policyOverrideId }
        : {}),
    }),
  )}`;
}

export function clientCommandLockKey(
  tenantId: string,
  clientKey: string,
): string {
  return `ace-pace-client:${tenantId}:${sha256(clientKey.trim())}`;
}

export function parsePaceOrThrow(value: number): PaceNumber {
  try {
    return parsePaceNumber(value);
  } catch {
    throw new BadRequestException("Invalid PACE number");
  }
}

export function toDatabaseAssessmentType(
  value: CreatePaceAssessmentDto["assessmentType"],
): DatabaseAssessmentType {
  return value === "SelfTest" ? "SELF_TEST" : "PACE_TEST";
}

function fromDatabaseAssessmentType(
  value: DatabaseAssessmentType,
): PaceAssessmentType {
  return value === "SELF_TEST" ? "SelfTest" : "FinalTest";
}

export function toDomainFact(fact: AssessmentRecord): PaceAssessmentFact {
  return {
    id: fact.id,
    paceNumber: fact.paceNumber,
    assessmentType: fromDatabaseAssessmentType(fact.assessmentType),
    result: fact.result === "PASSED" ? "passed" : "failed",
    assessedOn: formatDatabaseDate(fact.assessedOn),
    ...(fact.policyOverrideId ? { hasAuthorisedOverride: true } : {}),
    ...(fact.correctsAssessmentId
      ? { correctsFactId: fact.correctsAssessmentId }
      : {}),
  };
}

export function terminalAssessmentFacts(
  facts: readonly PaceAssessmentFact[],
): PaceAssessmentFact[] {
  const correctedIds = new Set(
    facts.flatMap((fact) => (fact.correctsFactId ? [fact.correctsFactId] : [])),
  );
  return facts
    .filter((fact) => !correctedIds.has(fact.id))
    .sort(
      (left, right) =>
        left.assessedOn.localeCompare(right.assessedOn) ||
        left.id.localeCompare(right.id),
    );
}

export function terminalAssessmentRecords(
  facts: readonly AssessmentRecord[],
): AssessmentRecord[] {
  const correctedIds = new Set(
    facts.flatMap((fact) =>
      fact.correctsAssessmentId ? [fact.correctsAssessmentId] : [],
    ),
  );
  return facts
    .filter((fact) => !correctedIds.has(fact.id))
    .sort(
      (left, right) =>
        formatDatabaseDate(left.assessedOn).localeCompare(
          formatDatabaseDate(right.assessedOn),
        ) || left.id.localeCompare(right.id),
    );
}

export function toTerminalDomainFacts(
  facts: readonly AssessmentRecord[],
): PaceAssessmentFact[] {
  return terminalAssessmentRecords(facts).map((fact) => {
    const domainFact = toDomainFact(fact);
    return {
      id: domainFact.id,
      paceNumber: domainFact.paceNumber,
      assessmentType: domainFact.assessmentType,
      result: domainFact.result,
      assessedOn: domainFact.assessedOn,
      ...(domainFact.hasAuthorisedOverride
        ? { hasAuthorisedOverride: true }
        : {}),
    };
  });
}

export function completedPaceCount(
  facts: readonly PaceAssessmentFact[],
): number {
  return facts.filter(
    (fact) =>
      fact.assessmentType === "FinalTest" &&
      (fact.result === "passed" || fact.hasAuthorisedOverride === true),
  ).length;
}

export function toTrackStatus(
  currentPace: number,
  targetPace: number,
): DatabaseTrackStatus {
  const comparison = comparePaceNumbers(
    parsePaceNumber(currentPace),
    parsePaceNumber(targetPace),
  );
  if (comparison > 0) return "AHEAD";
  if (comparison < 0) return "BEHIND";
  return "ON_TRACK";
}

export function rebuildProgressRecord(
  enrollment: {
    startingPace: number;
    currentPace: number;
    targetPace: number;
  },
  facts: readonly AssessmentRecord[],
  policy: PacePolicyResult,
  rebuiltAt: Date,
): ProgressRecord {
  const domainFacts = toTerminalDomainFacts(facts);
  const rebuilt = rebuildPaceProgress({
    assignedLevel: parsePaceOrThrow(enrollment.startingPace).level,
    startingPace: enrollment.currentPace,
    assessmentFacts: domainFacts,
  });
  return {
    currentPace: rebuilt.currentPace.raw,
    targetPace: enrollment.targetPace,
    completedPaces: completedPaceCount(domainFacts),
    trackStatus: toTrackStatus(rebuilt.currentPace.raw, enrollment.targetPace),
    blockCode: policy.decision === "warn" ? policy.code : null,
    lastAssessmentId: domainFacts.at(-1)?.id ?? null,
    rebuiltAt,
  };
}

export function localDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function toDatabaseDate(localDate: string): Date {
  return new Date(`${localDate}T12:00:00.000Z`);
}

export function formatDatabaseDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isIanaTimezone(value: string | null): value is string {
  if (!value?.trim()) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function toCommandResponse(
  fact: AssessmentRecord,
  progress: ProgressRecord,
  policy: PacePolicyResult | undefined,
  duplicate: boolean,
): PaceCommandResponse {
  return {
    assessment: {
      id: fact.id,
      childId: fact.childId,
      subjectId: fact.subjectId,
      paceNumber: fact.paceNumber,
      assessmentType: fromDatabaseAssessmentType(fact.assessmentType),
      score: fact.score,
      result: fact.result === "PASSED" ? "passed" : "failed",
      assessedOn: formatDatabaseDate(fact.assessedOn),
    },
    progress: {
      currentPace: progress.currentPace,
      targetPace: progress.targetPace,
      completedPaces: progress.completedPaces,
      trackStatus: progress.trackStatus,
      blockCode: progress.blockCode,
      lastAssessmentId: progress.lastAssessmentId,
      rebuiltAt: progress.rebuiltAt.toISOString(),
    },
    ...(policy ? { policy } : {}),
    duplicate,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
