import { z } from "zod";

export const faithIdSchema = z.string().uuid();

export const faithAudienceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ALL_ACTIVE_STUDENTS") }),
  z.object({
    type: z.literal("AGE_BAND"),
    ageBandIds: z
      .array(faithIdSchema)
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
]);

const optionalText = z.string().trim().max(500).optional();
const sourceUrl = z
  .string()
  .trim()
  .url()
  .max(2000)
  .refine((url) => {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  }, "Use a safe web link")
  .optional();

export const faithPayloadSchema = z
  .object({
    body: z.string().trim().min(1).max(10000),
    sourceLabel: optionalText,
    sourceUrl,
    reflectionPrompt: z.string().trim().max(2000).optional(),
  })
  .strict();

export const createFaithDraftSchema = z
  .object({
    faithContentId: faithIdSchema.optional(),
    title: z.string().trim().min(1).max(160),
    contentPayload: faithPayloadSchema,
    audience: faithAudienceSchema,
  })
  .strict();

export const updateFaithDraftSchema = createFaithDraftSchema
  .omit({ faithContentId: true })
  .extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) });

export const publishFaithSchema = z
  .object({
    draftId: faithIdSchema,
    expectedVersionId: faithIdSchema.nullable(),
  })
  .strict();

export const scheduleFaithSchema = publishFaithSchema.extend({
  scheduledAt: z.string().datetime({ offset: true }),
});

export const cancelFaithScheduleSchema = z
  .object({ draftId: faithIdSchema })
  .strict();
export const withdrawFaithSchema = z
  .object({ expectedVersionId: faithIdSchema })
  .strict();
export const faithSettingsSchema = z
  .object({
    displayLabel: z.string().trim().min(2).max(60),
  })
  .strict();
export const faithFeedQuerySchema = z
  .object({
    childId: faithIdSchema.optional(),
    cursor: faithIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const faithListQuerySchema = faithFeedQuerySchema.omit({
  childId: true,
});

export type CreateFaithDraft = z.infer<typeof createFaithDraftSchema>;
export type UpdateFaithDraft = z.infer<typeof updateFaithDraftSchema>;
export type PublishFaith = z.infer<typeof publishFaithSchema>;
export type ScheduleFaith = z.infer<typeof scheduleFaithSchema>;
export type FaithAudience = z.infer<typeof faithAudienceSchema>;
