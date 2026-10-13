import { createHash } from "node:crypto";

const MAX_SEQUENCE = 2_147_483_647;

function scopeFor(
  tenantId: string,
  userId: string,
  conversationId: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ tenantId, userId, conversationId }))
    .digest("base64url");
}

export function encodeMessageHistoryCursor(
  sequence: number,
  tenantId: string,
  userId: string,
  conversationId: string,
): string {
  return Buffer.from(
    JSON.stringify({
      sequence,
      scope: scopeFor(tenantId, userId, conversationId),
    }),
  ).toString("base64url");
}

export function decodeMessageHistoryCursor(
  encoded: string,
  tenantId: string,
  userId: string,
  conversationId: string,
): number {
  const value: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("sequence" in value) ||
    !("scope" in value) ||
    typeof value.sequence !== "number" ||
    !Number.isInteger(value.sequence) ||
    value.sequence < 1 ||
    value.sequence > MAX_SEQUENCE ||
    value.scope !== scopeFor(tenantId, userId, conversationId)
  ) {
    throw new Error("Invalid message cursor");
  }
  return value.sequence;
}
