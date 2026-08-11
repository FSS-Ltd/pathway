import { ConflictException } from "@nestjs/common";
import type { PacePolicyCode, PacePolicyResult } from "@pathway/ace-domain";
import type { Prisma } from "@pathway/db";
import { parsePaceOrThrow, type ProgressRecord } from "./pace-command.support";

const policyCodes: readonly PacePolicyCode[] = [
  "allowed",
  "score-below-threshold",
  "daily-limit",
  "duplicate-self-test",
  "same-pace-same-day",
  "progression-blocked",
  "override-required",
];

const trackStatuses = [
  "AHEAD",
  "ON_TRACK",
  "AT_RISK",
  "BEHIND",
  "BLOCKED",
] as const;

export interface RecordedPaceCommandResult {
  policy: PacePolicyResult;
  progress: ProgressRecord;
}

export function parseRecordedPaceCommandResult(
  metadata: Prisma.JsonValue,
): RecordedPaceCommandResult {
  if (!isRecord(metadata) || !isRecord(metadata.progress)) {
    throw unavailableState();
  }
  const decision = metadata.policyDecision;
  const code = metadata.policyCode;
  const nextPace = metadata.policyNextPace;
  const progress = metadata.progress;
  if (
    (decision !== "allow" && decision !== "warn") ||
    typeof code !== "string" ||
    !policyCodes.includes(code as PacePolicyCode) ||
    (nextPace !== null && typeof nextPace !== "number") ||
    typeof progress.currentPace !== "number" ||
    typeof progress.targetPace !== "number" ||
    typeof progress.completedPaces !== "number" ||
    typeof progress.trackStatus !== "string" ||
    !trackStatuses.includes(
      progress.trackStatus as (typeof trackStatuses)[number],
    ) ||
    (progress.blockCode !== null && typeof progress.blockCode !== "string") ||
    (progress.lastAssessmentId !== null &&
      typeof progress.lastAssessmentId !== "string") ||
    typeof progress.rebuiltAt !== "string" ||
    Number.isNaN(new Date(progress.rebuiltAt).getTime())
  ) {
    throw unavailableState();
  }
  return {
    policy: {
      decision,
      code: code as PacePolicyCode,
      ...(typeof nextPace === "number"
        ? { nextPace: parsePaceOrThrow(nextPace) }
        : {}),
    },
    progress: {
      currentPace: progress.currentPace,
      targetPace: progress.targetPace,
      completedPaces: progress.completedPaces,
      trackStatus: progress.trackStatus as ProgressRecord["trackStatus"],
      blockCode: progress.blockCode as string | null,
      lastAssessmentId: progress.lastAssessmentId as string | null,
      rebuiltAt: new Date(progress.rebuiltAt),
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unavailableState(): ConflictException {
  return new ConflictException("PACE command state is unavailable");
}
