import { z } from "zod";

const contentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(20_000),
  audience: z.enum(["PARENTS", "STAFF", "PARENTS_AND_STAFF"]),
  expiresAt: z.string().datetime({ offset: true }).nullable(),
});

export const noticeDraftIdSchema = z.string().uuid();
export const createNoticeDraftSchema = contentSchema.strict();
export const updateNoticeDraftSchema = contentSchema
  .extend({ expectedUpdatedAt: z.string().datetime({ offset: true }) })
  .strict();
export const listNoticeDraftsSchema = z
  .object({
    cursor: noticeDraftIdSchema.optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export type CreateNoticeDraftDto = z.infer<typeof createNoticeDraftSchema>;
export type UpdateNoticeDraftDto = z.infer<typeof updateNoticeDraftSchema>;
export type ListNoticeDraftsDto = z.infer<typeof listNoticeDraftsSchema>;
