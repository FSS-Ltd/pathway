import { createHash } from "node:crypto";

interface ConversationCursor {
  updatedAt: Date;
  id: string;
}

export type ConversationView =
  | "staff-conversations"
  | "school-team-conversations";

function scopeFor(
  tenantId: string,
  userId: string,
  view: ConversationView,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ tenantId, userId, view }))
    .digest("base64url");
}

export function encodeConversationCursor(
  cursor: ConversationCursor,
  tenantId: string,
  userId: string,
  view: ConversationView = "staff-conversations",
): string {
  return Buffer.from(
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      id: cursor.id,
      scope: scopeFor(tenantId, userId, view),
    }),
  ).toString("base64url");
}

export function decodeConversationCursor(
  encoded: string,
  tenantId: string,
  userId: string,
  view: ConversationView = "staff-conversations",
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
    value.scope !== scopeFor(tenantId, userId, view)
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
