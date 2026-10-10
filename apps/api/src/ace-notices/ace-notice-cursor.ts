import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

export interface NoticeCursorPosition {
  publishedAt: Date;
  id: string;
}

interface NoticeCursorPayload {
  publishedAt: string;
  id: string;
  scope: string;
}

function signingKey(): string {
  const key = process.env.INTERNAL_AUTH_SECRET;
  if (!key?.trim()) throw new Error("Notice cursor signing key is unavailable");
  return key;
}

function signature(payload: NoticeCursorPayload): string {
  return createHmac("sha256", signingKey())
    .update("ace-notice-inbox:v1\0")
    .update(JSON.stringify(payload))
    .digest("base64url");
}

export function noticeCursorScope(tenantId: string, userId: string): string {
  return createHash("sha256")
    .update(JSON.stringify(["staff", tenantId, userId]))
    .digest("base64url");
}

export function encodeNoticeCursor(
  position: NoticeCursorPosition,
  scope: string,
): string {
  const payload: NoticeCursorPayload = {
    publishedAt: position.publishedAt.toISOString(),
    id: position.id,
    scope,
  };
  return Buffer.from(
    JSON.stringify({ ...payload, signature: signature(payload) }),
  ).toString("base64url");
}

export function decodeNoticeCursor(
  encoded: string,
  scope: string,
): NoticeCursorPosition {
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(encoded)) {
    throw new BadRequestException("Invalid notice cursor");
  }
  const bytes = Buffer.from(encoded, "base64url");
  if (bytes.toString("base64url") !== encoded) {
    throw new BadRequestException("Invalid notice cursor");
  }
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8"));
  } catch {
    throw new BadRequestException("Invalid notice cursor");
  }
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 4 ||
    !("publishedAt" in value) ||
    !("id" in value) ||
    !("scope" in value) ||
    !("signature" in value) ||
    typeof value.publishedAt !== "string" ||
    typeof value.id !== "string" ||
    typeof value.scope !== "string" ||
    typeof value.signature !== "string" ||
    value.scope !== scope ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.id,
    ) ||
    !/^[A-Za-z0-9_-]{43}$/.test(value.signature)
  ) {
    throw new BadRequestException("Invalid notice cursor");
  }
  const publishedAt = new Date(value.publishedAt);
  if (
    Number.isNaN(publishedAt.getTime()) ||
    publishedAt.toISOString() !== value.publishedAt
  ) {
    throw new BadRequestException("Invalid notice cursor");
  }
  const expected = Buffer.from(
    signature({ publishedAt: value.publishedAt, id: value.id, scope }),
  );
  if (!timingSafeEqual(Buffer.from(value.signature), expected)) {
    throw new BadRequestException("Invalid notice cursor");
  }
  return { publishedAt, id: value.id };
}
