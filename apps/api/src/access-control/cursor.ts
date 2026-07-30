export interface CreatedAtIdCursor {
  createdAt: Date;
  id: string;
}

export function encodeCreatedAtIdCursor(cursor: CreatedAtIdCursor): string {
  return Buffer.from(
    JSON.stringify({ createdAt: cursor.createdAt.toISOString(), id: cursor.id }),
  ).toString("base64url");
}

export function decodeCreatedAtIdCursor(encoded: string): CreatedAtIdCursor {
  const value: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 2 ||
    !("createdAt" in value) ||
    !("id" in value) ||
    typeof value.createdAt !== "string" ||
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    value.id.length > 128
  ) {
    throw new Error("Invalid cursor");
  }
  const createdAt = new Date(value.createdAt);
  if (
    Number.isNaN(createdAt.getTime()) ||
    createdAt.toISOString() !== value.createdAt
  ) {
    throw new Error("Invalid cursor");
  }
  return { createdAt, id: value.id };
}
