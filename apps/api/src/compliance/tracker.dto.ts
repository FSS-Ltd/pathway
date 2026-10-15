import { BadRequestException } from "@nestjs/common";
import { z } from "zod";
import { INSTITUTIONAL_VERTICALS, institutionalSector } from "@pathway/types";
import { agreementPdf } from "./agreements.dto";
export const trackerArchiveInput = z.object({}).strict().default({});
export const trackerId = z.string().uuid();
export const trackerRequirementId = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_.:-]+$/);
const text = z
  .string()
  .trim()
  .max(200)
  .transform((value) => value || null)
  .nullable();
const flag = z.boolean().nullable();
export const trackerProfileInput = z
  .object({
    jurisdictionId: trackerId.nullable(),
    region: text,
    localAuthority: text,
    sector: z
      .enum(["CHURCH", "CLUB", "SCHOOL", "CHARITY", "LEARNING_CENTRE"])
      .nullable(),
    vertical: z.enum(INSTITUTIONAL_VERTICALS).nullable(),
    providerCategory: z
      .enum([
        "INDEPENDENT_SCHOOL",
        "STATE_SCHOOL",
        "EARLY_YEARS",
        "CHILDCARE",
        "OUT_OF_SCHOOL",
        "OTHER",
      ])
      .nullable(),
    schoolCategory: z
      .enum(["MAINTAINED", "ACADEMY", "INDEPENDENT", "NOT_SCHOOL"])
      .nullable()
      .optional(),
    englandSchoolMedicalDutiesApply: flag.optional(),
    personalDataController: flag.optional(),
    employsStaff: flag.optional(),
    controlsPremises: flag.optional(),
    foodBusiness: flag.optional(),
    operatesVehicles: flag.optional(),
    eyfsApplies: flag.optional(),
    fundingStatus: z.enum(["PUBLIC", "PRIVATE", "MIXED"]).nullable(),
    minimumAge: z.number().int().min(0).max(100).nullable(),
    maximumAge: z.number().int().min(0).max(100).nullable(),
    provisionPattern: z.enum(["FULL_TIME", "PART_TIME", "MIXED"]).nullable(),
    childcare: flag,
    charitable: flag,
    food: flag,
    transport: flag,
    trips: flag,
    boarding: flag,
    ace: flag,
    icce: flag,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.schoolCategory != null &&
      ((value.providerCategory === "INDEPENDENT_SCHOOL" &&
        value.schoolCategory !== "INDEPENDENT") ||
        (value.providerCategory === "STATE_SCHOOL" &&
          !["MAINTAINED", "ACADEMY"].includes(value.schoolCategory)))
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["schoolCategory"],
        message:
          "School category must match the registered provider category. Review the saved school category or explicitly clear it to unknown.",
      });
    if (
      value.minimumAge !== null &&
      value.maximumAge !== null &&
      value.minimumAge > value.maximumAge
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maximumAge"],
        message: "Maximum age must not be below minimum age",
      });
    if (
      value.vertical !== null &&
      value.sector !== null &&
      institutionalSector(value.vertical) !== value.sector
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["vertical"],
        message: "Choose a type in the selected sector",
      });
  });
const additionalProfileDefaults = {
  schoolCategory: null,
  englandSchoolMedicalDutiesApply: null,
  personalDataController: null,
  employsStaff: null,
  controlsPremises: null,
  foodBusiness: null,
  operatesVehicles: null,
  eyfsApplies: null,
};

/** Preserve omitted additive facts on legacy writes; explicit null clears them. */
export function normalizeTrackerProfile(
  input: unknown,
  current?: z.infer<typeof trackerProfileInput>,
): z.infer<typeof trackerProfileInput> {
  const parsed = parseTracker(trackerProfileInput, input);
  const supplied = Object.fromEntries(
    Object.entries(parsed).filter(([, value]) => value !== undefined),
  );
  return parseTracker(trackerProfileInput, {
    ...additionalProfileDefaults,
    ...current,
    ...supplied,
  });
}

export const trackerProfileUpdate = z
  .object({
    expectedVersion: z.number().int().min(0),
    profile: trackerProfileInput,
  })
  .strict();
export const trackerReviewDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Use a valid review date");
export const trackerAttestationInput = z
  .object({
    requirementId: trackerRequirementId,
    requirementVersion: z.number().int().positive(),
    profileVersion: z.number().int().positive(),
    expectedRevision: z.number().int().min(0),
    status: z.enum(["COMPLETE", "NOT_STARTED", "NOT_APPLICABLE"]),
    notes: z.string().trim().max(5000),
    notApplicableReason: z.string().trim().min(1).max(2000).nullable(),
    reviewDueAt: trackerReviewDate.nullable(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.status === "NOT_APPLICABLE" && !value.notApplicableReason)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notApplicableReason"],
        message: "Explain why this action does not apply",
      });
    if (value.status !== "NOT_APPLICABLE" && value.notApplicableReason !== null)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["notApplicableReason"],
        message: "A reason belongs only to a not-applicable decision",
      });
  });
export const trackerEvidenceInput = z
  .object({
    requirementId: trackerRequirementId,
    requirementVersion: z.number().int().positive(),
    title: z.string().trim().min(1).max(200),
    notes: z.string().trim().max(5000),
    pdf: agreementPdf,
  })
  .strict();
export const trackerHistoryIndexQuery = z
  .object({ cursor: trackerRequirementId.optional() })
  .strict();
export const trackerPageQuery = z
  .object({ requirementId: trackerRequirementId, cursor: trackerId.optional() })
  .strict();
export function parseTracker<T>(
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: unknown,
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new BadRequestException(parsed.error.flatten());
  return parsed.data;
}
