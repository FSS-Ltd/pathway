import { z } from "zod";
import {
  attendanceStatusSchema,
  validateCompatibleAttendanceInput,
} from "./attendance-status";

export const createAttendanceDto = z
  .object({
    childId: z
      .string({ required_error: "childId is required" })
      .uuid("childId must be a valid uuid"),
    groupId: z
      .string({ required_error: "groupId is required" })
      .uuid("groupId must be a valid uuid"),
    status: attendanceStatusSchema.optional(),
    present: z.boolean().optional(),
    sessionId: z.string().uuid().optional(),
    timestamp: z
      .union([
        z
          .string()
          .datetime()
          .transform((v) => new Date(v)),
        z.date(),
      ])
      .optional(),
  })
  .superRefine(validateCompatibleAttendanceInput);

export type CreateAttendanceDto = z.infer<typeof createAttendanceDto>;
