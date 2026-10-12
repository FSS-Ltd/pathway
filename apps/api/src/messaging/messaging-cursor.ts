import { createHash } from "node:crypto";

interface ConversationCursor {
  updatedAt: Date;
  id: string;
}

function scopeFor(tenantId: string, userId: string): string {
  return createHash("sha256")
    .update(JSON.stringify({ tenantId, userId, view: "staff-conversations" }))
    .digest("base64url");
}

export function encodeConversationCursor(
  cursor: ConversationCursor,
  tenantId: string,
  userId: string,
): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
      scope: scopeFor(tenantId, userId),
    }),
  ).toString("base64url");
}

export function decodeConversationCursor(
  encoded: string,
  tenantId: string,
  userId: string,
): ConversationCursor {
  const value: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    !("updatedAt" in value) ||
    !("id" in value) ||
    !("scope" in value) ||
    typeof value.updatedAt !== "string" ||
    typeof value.id !== "string" ||
    typeof value.scope !== "string" ||
    !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(
      value.id,
    ) ||
    value.scope !== scopeFor(tenantId, userId)
  ) {
    throw new Error("Invalid conversation cursor");
  }
  const updatedAt = new Date(value.updatedAt);
  if (
    Number.isNaN(updatedAt.getTime()) ||
    updatedAt.toISOString() !== value.updatedAt
  ) {
    throw new Error("Invalid conversation cursor");
  }
  return { updatedAt, id: value.id };
}
