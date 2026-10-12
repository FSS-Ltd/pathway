import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { BehaviourActor } from "./behaviour-command.service";
import type { BehaviourListQuery } from "./dto/behaviour-entry.dto";

interface CursorPosition {
  occurredAt: Date;
  id: string;
  snapshotAt: Date;
}

interface CursorPayload {
  occurredAt: string;
  id: string;
  snapshotAt: string;
  scope: string;
}

function signingKey(): string {
  const key = process.env.INTERNAL_AUTH_SECRET;
  if (!key?.trim()) {
    throw new Error("Behaviour history cursor signing key is unavailable");
  }
  return key;
}

function signature(payload: CursorPayload): string {
  return createHmac("sha256", signingKey())
    .update("behaviour-history:v1\0")
    .update(JSON.stringify(payload))
    .digest("base64url");
}

export function behaviourHistoryCursorScope(
  actor: BehaviourActor,
  query: BehaviourListQuery,
  canReadSensitive: boolean,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        tenantId: actor.tenantId,
        orgId: actor.orgId,
        userId: actor.userId,
        childId: query.childId ?? null,
        type: query.type ?? null,
        visibility: query.visibility ?? null,
        occurredFrom: query.occurredFrom ?? null,
        occurredTo: query.occurredTo ?? null,
        limit: query.limit ?? 50,
        canReadSensitive,
      }),
    )
    .digest("base64url");
}

export function encodeBehaviourHistoryCursor(
  position: CursorPosition,
  scope: string,
): string {
  const payload: CursorPayload = {
    occurredAt: position.occurredAt.toISOString(),
    id: position.id,
    snapshotAt: position.snapshotAt.toISOString(),
    scope,
  };
  return Buffer.from(
    JSON.stringify({ ...payload, signature: signature(payload) }),
  ).toString("base64url");
}

export function decodeBehaviourHistoryCursor(
  encoded: string,
  expectedScope: string,
): CursorPosition {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(encoded)) {
    throw new Error("Invalid behaviour history cursor");
  }
  const value: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 5 ||
    !("occurredAt" in value) ||
    !("id" in value) ||
    !("snapshotAt" in value) ||
    !("scope" in value) ||
    !("signature" in value) ||
    typeof value.occurredAt !== "string" ||
    typeof value.id !== "string" ||
    typeof value.snapshotAt !== "string" ||
    typeof value.scope !== "string" ||
    typeof value.signature !== "string" ||
    value.scope !== expectedScope ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.id,
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.signature)
  ) {
    throw new Error("Invalid behaviour history cursor");
  }
  const occurredAt = parseIso(value.occurredAt);
  const snapshotAt = parseIso(value.snapshotAt);
  const payload = {
    occurredAt: value.occurredAt,
    id: value.id,
    snapshotAt: value.snapshotAt,
    scope: value.scope,
  };
  const expected = Buffer.from(signature(payload));
  const actual = Buffer.from(value.signature);
  if (!timingSafeEqual(actual, expected)) {
    throw new Error("Invalid behaviour history cursor");
  }
  return { occurredAt, id: value.id, snapshotAt };
}

export function requireBehaviourHistoryCursorSigningKey(): void {
  signingKey();
}

function parseIso(value: string): Date {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new Error("Invalid behaviour history cursor");
  }
  return parsed;
}
