import { createHash } from "node:crypto";
import { BadRequestException } from "@nestjs/common";

export const MAX_HOMEWORK_EVIDENCE_BYTES = 2 * 1024 * 1024;
export const HOMEWORK_EVIDENCE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
] as const;

export type HomeworkEvidenceType = (typeof HOMEWORK_EVIDENCE_TYPES)[number];

export function validateEvidenceIntent(input: {
  fileName: string;
  mimeType: string;
  byteLength: number;
  sha256: string;
}): asserts input is typeof input & { mimeType: HomeworkEvidenceType } {
  if (
    input.fileName.length < 1 ||
    input.fileName.length > 160 ||
    input.fileName === "." ||
    input.fileName === ".." ||
    /[\\/]/u.test(input.fileName) ||
    Array.from(input.fileName).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  ) {
    throw new BadRequestException("Invalid evidence file name");
  }
  if (
    !HOMEWORK_EVIDENCE_TYPES.includes(input.mimeType as HomeworkEvidenceType)
  ) {
    throw new BadRequestException("Unsupported evidence file type");
  }
  if (
    !Number.isSafeInteger(input.byteLength) ||
    input.byteLength < 1 ||
    input.byteLength > MAX_HOMEWORK_EVIDENCE_BYTES
  ) {
    throw new BadRequestException("Evidence file exceeds the 2 MB limit");
  }
  if (!/^[0-9a-f]{64}$/.test(input.sha256)) {
    throw new BadRequestException("Invalid evidence checksum");
  }
}

export function verifyEvidenceBytes(
  body: Buffer,
  expected: {
    mimeType: HomeworkEvidenceType;
    byteLength: number;
    sha256: string;
  },
): void {
  const signatures: Record<HomeworkEvidenceType, Buffer> = {
    "application/pdf": Buffer.from("%PDF-"),
    "image/png": Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    "image/jpeg": Buffer.from([255, 216, 255]),
  };
  if (
    body.length !== expected.byteLength ||
    body.length > MAX_HOMEWORK_EVIDENCE_BYTES ||
    !body
      .subarray(0, signatures[expected.mimeType].length)
      .equals(signatures[expected.mimeType]) ||
    createHash("sha256").update(body).digest("hex") !== expected.sha256
  ) {
    throw new BadRequestException("Evidence file failed verification");
  }
}
