import { z } from "zod";
import { faithIdSchema } from "../faith.dto";

export const createReflectionSchema = z
  .object({ text: z.string().trim().min(1).max(5000) })
  .strict();

export const listReflectionsSchema = z
  .object({
    siteId: faithIdSchema.optional(),
    childId: faithIdSchema.optional(),
    cursor: faithIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const moderateReflectionSchema = z
  .object({ decision: z.enum(["APPROVED", "REJECTED"]) })
  .strict();

export const reportReflectionSchema = z
  .object({ category: z.enum(["SAFETY", "BULLYING", "OTHER"]) })
  .strict();

export type CreateReflection = z.infer<typeof createReflectionSchema>;
export type ListReflections = z.infer<typeof listReflectionsSchema>;
export type ModerateReflection = z.infer<typeof moderateReflectionSchema>;
export type ReportReflection = z.infer<typeof reportReflectionSchema>;
