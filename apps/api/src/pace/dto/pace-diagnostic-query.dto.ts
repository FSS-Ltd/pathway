import { z } from "zod";

const siteId = z
  .string()
  .uuid()
  .transform((id) => id.toLowerCase());

export const paceDiagnosticQuerySchema = z
  .object({
    childId: siteId,
    subjectId: siteId,
    includeRetracted: z.enum(["true"]).optional(),
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4]\d|50)$/)
      .transform(Number)
      .optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type PaceDiagnosticQuery = z.infer<typeof paceDiagnosticQuerySchema>;
