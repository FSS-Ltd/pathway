import { z } from "zod";

const rosterLimit = z
  .string()
  .regex(/^(?:[1-9]|[1-4]\d|50)$/)
  .transform(Number)
  .optional();

export const paceRosterQuerySchema = z
  .object({
    limit: rosterLimit,
    cursor: z.string().min(1).max(512).optional(),
    subjectId: z.string().uuid().optional(),
    status: z.enum(["AHEAD", "ON_TRACK", "AT_RISK", "BEHIND", "BLOCKED"]).optional(),
    groupId: z.string().uuid().optional(),
    search: z.string().trim().min(1).max(100).optional(),
  })
  .strict();

export type PaceRosterQuery = z.infer<typeof paceRosterQuerySchema>;

export const paceExceptionsQuerySchema = z
  .object({
    limit: rosterLimit,
    cursor: z.string().min(1).max(512).optional(),
  })
  .strict();

export type PaceExceptionsQuery = z.infer<typeof paceExceptionsQuerySchema>;
