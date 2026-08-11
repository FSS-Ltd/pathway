import { createHash } from "node:crypto";

export interface PaceRosterCursor {
  createdAt: Date;
  id: string;
  scope: string;
}

export interface PaceRosterCursorScope {
  tenantId: string;
  orgId: string;
  subjectId: string | null;
  status: string | null;
  groupId: string | null;
  search: string | null;
}

export function createPaceRosterCursorScope(
  scope: PaceRosterCursorScope,
): string {
  return createHash("sha256")
    .update(JSON.stringify(scope))
    .digest("base64url");
}

export function encodePaceRosterCursor(cursor: PaceRosterCursor): string {
  return Buffer.from(
    JSON.stringify({
      createdAt: cursor.createdAt.toISOString(),
      id: cursor.id,
      scope: cursor.scope,
    }),
  ).toString("base64url");
}

export function decodePaceRosterCursor(encoded: string): PaceRosterCursor {
  const value: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 3 ||
    !("createdAt" in value) ||
    !("id" in value) ||
    !("scope" in value) ||
    typeof value.createdAt !== "string" ||
    typeof value.id !== "string" ||
    typeof value.scope !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128 ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.scope)
  ) {
    throw new Error("Invalid PACE roster cursor");
  }
  const createdAt = new Date(value.createdAt);
  if (
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== value.createdAt
  ) {
    throw new Error("Invalid PACE roster cursor");
  }
  return { createdAt, id: value.id, scope: value.scope };
}
