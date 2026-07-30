import { z } from "zod";

const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const assignmentInputDto = z
  .object({
    userId: z.string().min(1),
    roleDefinitionId: z.string().uuid(),
    startsAt: isoDate,
    expiresAt: isoDate.optional(),
  })
  .strict();

export const assignmentRequestDto = z.union([
  assignmentInputDto,
  z.array(assignmentInputDto).min(1).max(50),
]);

export const assignmentListQueryDto = z
  .object({
    limit: z
      .string()
      .regex(/^(?:[1-9]|[1-4]\d|50)$/)
      .transform(Number)
      .optional(),
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();
