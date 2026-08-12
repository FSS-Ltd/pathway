import { z } from "zod";
import {
  attendanceStatusSchema,
  correctionReasonSchema,
  validateCompatibleAttendanceInput,
} from "./attendance-status";

export const updateAttendanceDto = z
  .object({
    childId: z.string().uuid().optional(),
    groupId: z.string().uuid().optional(),
    sessionId: z.string().uuid().optional(),
    status: attendanceStatusSchema.optional(),
    present: z.boolean().optional(),
    correctionReason: correctionReasonSchema.optional(),
    timestamp: z
      .preprocess((arg) => {
        if (typeof arg === "string" || arg instanceof Date) {
          return new Date(arg);
        }
      }, z.date())
      .optional(),
  })
  .superRefine((input, context) => {
    if (input.status !== undefined || input.present !== undefined) {
      validateCompatibleAttendanceInput(input, context);
    }
  });

export type UpdateAttendanceDto = z.infer<typeof updateAttendanceDto>;
