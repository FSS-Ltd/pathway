import { createHash } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import type { Prisma } from "@pathway/db";
import type {
  BehaviourCorrectionDto,
  CreateBehaviourBatchDto,
  CreateBehaviourEntryDto,
} from "./dto/behaviour-entry.dto";

export type BehaviourEntryCommand =
  | CreateBehaviourEntryDto
  | BehaviourCorrectionDto;

export interface BehaviourEntryRecord {
  id: string;
  childId: string;
  category: string;
  categoryPolicyVersion: number | null;
  categoryIsSerious: boolean | null;
  type: "MERIT" | "DEMERIT" | "GENERAL";
  visibility: "GENERAL" | "SENSITIVE";
  pointsDelta: number;
  occurredAt: Date;
  recordedByUserId: string;
  reason: string;
  note: string | null;
  correctsBehaviourEntryId: string | null;
  clientCommandKeyHash: string | null;
  commandFingerprint: string | null;
  createdAt: Date;
}

export interface BehaviourEntryReplayMetadata {
  id: string;
  visibility: "GENERAL" | "SENSITIVE";
  commandFingerprint: string | null;
}

export const behaviourEntryReplayMetadataSelect = {
  id: true,
  visibility: true,
  commandFingerprint: true,
} satisfies Prisma.BehaviourEntrySelect;

export const behaviourEntryCommandSelect = {
  id: true,
  childId: true,
  category: true,
  categoryPolicyVersion: true,
  categoryIsSerious: true,
  type: true,
  visibility: true,
  pointsDelta: true,
  occurredAt: true,
  recordedByUserId: true,
  reason: true,
  note: true,
  correctsBehaviourEntryId: true,
  clientCommandKeyHash: true,
  commandFingerprint: true,
  createdAt: true,
} satisfies Prisma.BehaviourEntrySelect;

export const behaviourEntryQuerySelect = {
  id: true,
  childId: true,
  category: true,
  categoryPolicyVersion: true,
  categoryIsSerious: true,
  type: true,
  visibility: true,
  pointsDelta: true,
  occurredAt: true,
  recordedByUserId: true,
  reason: true,
  note: true,
  correctsBehaviourEntryId: true,
  createdAt: true,
  tenantId: false,
  clientCommandKeyHash: false,
  commandFingerprint: false,
} satisfies Prisma.BehaviourEntrySelect;

export type BehaviourEntryResponseRecord = Prisma.BehaviourEntryGetPayload<{
  select: typeof behaviourEntryQuerySelect;
}>;

export function behaviourClientCommandKeyHash(
  tenantId: string,
  clientKey: string,
): string {
  return sha256(`ace-behaviour-command:${tenantId}:${clientKey.trim()}`);
}

export function behaviourBatchFactKeyHash(
  tenantId: string,
  batchKey: string,
  index: number,
): string {
  // The first fact reserves the public key; later facts use an internal namespace.
  return index === 0
    ? behaviourClientCommandKeyHash(tenantId, batchKey)
    : sha256(
        `ace-behaviour-batch-fact:${tenantId}:${batchKey.trim()}:${index}`,
      );
}

export function behaviourBatchFingerprint(
  actorUserId: string,
  batch: CreateBehaviourBatchDto,
): string {
  return sha256(
    JSON.stringify({
      operation: "batch",
      actorUserId,
      childIds: batch.childIds,
      occurredAt: new Date(batch.occurredAt).toISOString(),
      entries: batch.entries.map((entry) => ({
        category: entry.category,
        type: entry.type,
        visibility: entry.visibility,
        pointsDelta: entry.pointsDelta,
        reason: entry.reason,
        note: entry.note ?? null,
        quantity: entry.quantity,
      })),
    }),
  );
}

export function behaviourCommandFingerprint(
  operation: "record" | "correct",
  actorUserId: string,
  command: BehaviourEntryCommand,
  correctsBehaviourEntryId: string | null,
): string {
  return sha256(
    JSON.stringify({
      operation,
      actorUserId,
      correctsBehaviourEntryId,
      childId: command.childId,
      category: command.category,
      type: command.type,
      visibility: command.visibility,
      pointsDelta: command.pointsDelta,
      occurredAt: new Date(command.occurredAt).toISOString(),
      reason: command.reason.trim(),
      note: command.note?.trim() ?? null,
      ...("correctionReason" in command && command.correctionReason
        ? { correctionReason: command.correctionReason.trim() }
        : {}),
    }),
  );
}

export function behaviourClientLockKey(
  tenantId: string,
  clientKey: string,
): string {
  return `ace-behaviour-client:${tenantId}:${sha256(clientKey.trim())}`;
}

export function behaviourIdempotencyConflict(): ConflictException {
  return new ConflictException({
    statusCode: 409,
    code: "BEHAVIOUR_IDEMPOTENCY_CONFLICT",
    message: "The idempotency key was already used for another command.",
  });
}

export function isBehaviourUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  );
}

export function toBehaviourEntryResponse(entry: BehaviourEntryResponseRecord) {
  return {
    id: entry.id,
    childId: entry.childId,
    category: entry.category,
    categoryPolicyVersion: entry.categoryPolicyVersion,
    categoryIsSerious: entry.categoryIsSerious,
    type: entry.type,
    visibility: entry.visibility,
    pointsDelta: entry.pointsDelta,
    occurredAt: entry.occurredAt.toISOString(),
    recordedByUserId: entry.recordedByUserId,
    reason: entry.reason,
    note: entry.note,
    correctsBehaviourEntryId: entry.correctsBehaviourEntryId,
    createdAt: entry.createdAt.toISOString(),
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
