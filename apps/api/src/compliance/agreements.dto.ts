import { z } from "zod";

export const agreementId = z.string().uuid();
export const agreementPdf = z
  .object({
    fileName: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .regex(/^[^/\\]+\.pdf$/i)
      .refine(
        (value) =>
          [...value].every(
            (character) =>
              character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
          ),
        "Use a valid file name",
      ),
    base64: z.string().min(1).max(2796204),
  })
  .strict();
export const agreementVersionInput = z
  .object({
    title: z.string().trim().min(1).max(200),
    contentText: z.string().trim().min(1).max(20000),
    originalPdf: agreementPdf.nullable(),
  })
  .strict();
export const agreementPublishInput = agreementVersionInput
  .extend({
    expectedVersion: z.number().int().min(1),
  })
  .strict();
export const agreementAssignInput = z
  .object({
    recipientUserIds: z
      .array(agreementId)
      .min(1)
      .max(50)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Recipients must be unique",
      ),
    adultsConfirmed: z.literal(true),
  })
  .strict();
export const agreementAcknowledgeInput = z
  .object({
    versionId: agreementId,
    typedName: z.string().trim().min(1).max(200),
    confirmed: z.literal(true),
  })
  .strict();
export const agreementSignedInput = z
  .object({
    versionId: agreementId,
    typedName: z.string().trim().min(1).max(200),
    signedOn: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00.000Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          value <= new Date().toISOString().slice(0, 10)
        );
      }, "Use a valid signing date that is not in the future"),
    pdf: agreementPdf,
  })
  .strict();
export const agreementPageQuery = z
  .object({ cursor: agreementId.optional() })
  .strict();
export const agreementAssignmentsQuery = agreementPageQuery
  .extend({ documentId: agreementId.optional() })
  .strict();
export const agreementPeopleQuery = z
  .object({
    cursor: agreementId.optional(),
    query: z.string().trim().max(100).optional(),
  })
  .strict();
