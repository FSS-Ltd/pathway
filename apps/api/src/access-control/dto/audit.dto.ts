import { z } from "zod";

export const auditListQueryDto = z
  .object({
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4]\d|50)$/)
      .transform(Number)
      .optional(),
    cursor: z.string().min(1).max(512).optional(),
    entityType: z
      .enum(["ORG_ROLE", "ROLE_ASSIGNMENT", "ACCESS_TAG_GRANT"])
      .optional(),
  })
  .strict();

export type AuditListQuery = z.infer<typeof auditListQueryDto>;
