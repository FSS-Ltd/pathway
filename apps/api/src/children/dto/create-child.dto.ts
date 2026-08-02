import { z } from "zod";

const dateString = z
  .string()
  .trim()
  .refine((s) => !s || /^\d{4}-\d{2}-\d{2}$/.test(s), "Date must be YYYY-MM-DD");

const specialNeedsType = z.enum(["none", "sen_support", "ehcp", "other"]);

export const createChildSchema = z.object({
  firstName: z.string().trim().min(1, "firstName is required").max(100),
  // Optional: some households (e.g. NexSteps Home) only collect a first
  // name/nickname at setup time. Defaults to "" rather than requiring a
  // placeholder value - "" is a valid non-null value for the DB column.
  lastName: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((s) => s ?? ""),
  allergies: z
    .string()
    .trim()
    .optional()
    .nullable()
    .transform((s) => (s ?? "").trim() || "none"),
  // tenantId is provided via auth context; keep optional for backward compat
  tenantId: z.string().uuid().optional(),

  photoKey: z.string().trim().optional().nullable(),
  disabilities: z.array(z.string()).optional(),

  groupId: z.string().uuid().optional(),
  guardianIds: z.array(z.string().uuid()).optional(),

  // Extended fields (parent signup parity)
  preferredName: z.string().trim().max(100).optional(),
  dateOfBirth: dateString.optional(),
  additionalNeedsNotes: z.string().trim().max(2000).optional(),
  schoolName: z.string().trim().max(200).optional(),
  yearGroup: z.string().trim().max(50).optional(),
  gpName: z.string().trim().max(200).optional(),
  gpPhone: z.string().trim().max(25).optional(),
  specialNeedsType: specialNeedsType.optional(),
  specialNeedsOther: z.string().trim().max(500).optional(),
  // Organisation photo/video consent. Internal profile pictures are handled separately.
  photoConsent: z.boolean().default(false),
  photoBase64: z.string().optional(),
  photoContentType: z.string().trim().max(100).optional(),
  pickupPermissions: z.string().trim().max(200).optional(),
});

export type CreateChildDto = z.infer<typeof createChildSchema>;
