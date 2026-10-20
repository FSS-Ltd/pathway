import { z } from "zod";

export const homeworkStudentIdSchema = z.string().uuid();

export const homeworkDraftSchema = z
  .object({
    text: z.string().max(5000),
  })
  .strict();

export const homeworkSubmitSchema = z
  .object({
    text: z.string().max(5000),
    evidenceId: z.string().uuid().optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const homeworkEvidenceIntentSchema = z
  .object({
    fileName: z.string().min(1).max(160),
    mimeType: z.string().min(1).max(80),
    byteLength: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
  })
  .strict();
