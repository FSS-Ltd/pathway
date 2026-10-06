import { createHash, createHmac, timingSafeEqual } from "node:crypto";

interface AttendanceHistoryCursor {
  correctedAt: Date;
  id: string;
}

interface CursorPayload {
  correctedAt: string;
  id: string;
  scope: string;
}

export function requireAttendanceHistoryCursorSigningKey(): string {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  if (!secret?.trim()) {
    throw new Error("Attendance history cursor signing key is unavailable");
  }
  return secret;
}

function signature(payload: CursorPayload): string {
  return createHmac("sha256", requireAttendanceHistoryCursorSigningKey())
    .update("attendance-history:v1\0")
    .update(JSON.stringify(payload))
    .digest("base64url");
}

export function attendanceHistoryCursorScope(
  tenantId: string,
  orgId: string,
  attendanceId: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ tenantId, orgId, attendanceId }))
    .digest("base64url");
}

export function encodeAttendanceHistoryCursor(
  cursor: AttendanceHistoryCursor,
  scope: string,
): string {
  const payload: CursorPayload = {
    correctedAt: cursor.correctedAt.toISOString(),
    id: cursor.id,
    scope,
  };
  return Buffer.from(
    JSON.stringify({ ...payload, signature: signature(payload) }),
  ).toString("base64url");
}

export function decodeAttendanceHistoryCursor(
  encoded: string,
  expectedScope: string,
): AttendanceHistoryCursor {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(encoded)) {
    throw new Error("Invalid attendance history cursor");
  }
  const value: unknown = JSON.parse(
    Buffer.from(encoded, "base64url").toString("utf8"),
  );
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !("correctedAt" in value) ||
    !("id" in value) ||
    !("scope" in value) ||
    !("signature" in value) ||
    typeof value.correctedAt !== "string" ||
    typeof value.id !== "string" ||
    typeof value.scope !== "string" ||
    typeof value.signature !== "string" ||
    value.scope !== expectedScope ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.id,
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.signature)
  ) {
    throw new Error("Invalid attendance history cursor");
  }

  const correctedAt = new Date(value.correctedAt);
  if (
    Number.isNaN(correctedAt.getTime()) ||
    correctedAt.toISOString() !== value.correctedAt
  ) {
    throw new Error("Invalid attendance history cursor");
  }

  const expected = Buffer.from(
    signature({
      correctedAt: value.correctedAt,
      id: value.id,
      scope: value.scope,
    }),
  );
  const actual = Buffer.from(value.signature);
  if (!timingSafeEqual(actual, expected)) {
    throw new Error("Invalid attendance history cursor");
  }
  return { correctedAt, id: value.id };
}
