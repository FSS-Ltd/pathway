import { z } from "zod";

const contentShape = {
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  audience: z.enum(["PARENTS", "STAFF", "PARENTS_AND_STAFF"]),
  audienceScope: z
    .enum(["SITE", "YEAR_BAND", "GROUP", "CHILD"])
    .default("SITE"),
  audienceTargetId: z.string().uuid().nullable().default(null),
  requiresAcknowledgement: z.boolean().default(false),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
};

const validTarget = (value: {
  audienceScope: "SITE" | "YEAR_BAND" | "GROUP" | "CHILD";
  audienceTargetId: string | null;
}) => (value.audienceScope === "SITE") === (value.audienceTargetId === null);

const targetError = {
  message: "Choose one target for a school audience",
  path: ["audienceTargetId"],
};

export const noticeDraftIdSchema = z.string().uuid();
export const createNoticeDraftSchema = z
  .object(contentShape)
  .strict()
  .refine(validTarget, targetError);
export const updateNoticeDraftSchema = z
  .object({
    ...contentShape,
    requiresAcknowledgement: z.boolean().optional(),
    expectedUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .refine(validTarget, targetError);
export const listNoticeDraftsSchema = z
  .object({
    cursor: noticeDraftIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export type CreateNoticeDraftDto = z.infer<typeof createNoticeDraftSchema>;
export type UpdateNoticeDraftDto = z.infer<typeof updateNoticeDraftSchema>;
export type ListNoticeDraftsDto = z.infer<typeof listNoticeDraftsSchema>;
