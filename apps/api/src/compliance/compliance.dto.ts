import { z } from "zod";
import {
  COMPLIANCE_CHECK_SCHEMES,
  COMPLIANCE_RECORD_KINDS,
  COMPLIANCE_RECORD_STATUSES,
} from "@pathway/types";

const optionalText = (limit: number) =>
  z
    .string()
    .trim()
    .max(limit)
    .transform((value) => value || null)
    .nullable();
const dateOnly = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid calendar date");

/** Structural schema also validates retained snapshots without reapplying current policy. */
export const complianceRecordFieldsSchema = z
  .object({
    subjectName: z.string().trim().min(1).max(200),
    subjectUserId: z.string().uuid().nullable(),
    roleDescription: z.string().trim().min(1).max(500),
    kind: z.enum(COMPLIANCE_RECORD_KINDS),
    scheme: z.enum(COMPLIANCE_CHECK_SCHEMES).nullable(),
    title: z.string().trim().min(1).max(200),
    provider: optionalText(200),
    reference: optionalText(200),
    completedOn: dateOnly.nullable(),
    reviewDueOn: dateOnly.nullable(),
    status: z.enum(COMPLIANCE_RECORD_STATUSES),
    notes: optionalText(5000),
    verificationNotes: optionalText(2000),
  })
  .strict();

function validateRecord(
  value: z.infer<typeof complianceRecordFieldsSchema>,
  context: z.RefinementCtx,
): void {
  const issue = (path: string, message: string) =>
    context.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  if ((value.kind === "BACKGROUND_CHECK") !== (value.scheme !== null))
    issue("scheme", "Choose a scheme only for a background check");
  if (value.status !== "PENDING" && !value.completedOn)
    issue("completedOn", "Record the certificate or completion date");
  if (
    value.completedOn &&
    value.completedOn > new Date().toISOString().slice(0, 10)
  )
    issue("completedOn", "Completion cannot be in the future");
  if (
    value.completedOn &&
    value.reviewDueOn &&
    value.reviewDueOn < value.completedOn
  )
    issue("reviewDueOn", "Review cannot precede completion");
  if (value.status === "VERIFIED" && !value.verificationNotes)
    issue("verificationNotes", "Describe the evidence you verified");
}

export const complianceRecordInputSchema =
  complianceRecordFieldsSchema.superRefine(validateRecord);
export const complianceVersionSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();
export const complianceUpdateSchema = complianceRecordFieldsSchema
  .extend({ expectedVersion: z.number().int().positive() })
  .superRefine(validateRecord);
export const complianceListSchema = z
  .object({
    cursor: z.string().uuid().optional(),
    kind: z.enum(COMPLIANCE_RECORD_KINDS).optional(),
    includeArchived: z
      .enum(["true", "false"])
      .optional()
      .transform((value) => value === "true"),
  })
  .strict();
export const complianceHistorySchema = z
  .object({ cursor: z.string().uuid().optional() })
  .strict();
export const compliancePeopleSchema = z
  .object({ query: z.string().trim().max(100).default("") })
  .strict();
export const complianceIdSchema = z.string().uuid();
