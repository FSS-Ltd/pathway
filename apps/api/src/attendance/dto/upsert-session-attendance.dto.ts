import { z } from "zod";
import {
  attendanceStatusSchema,
  correctionReasonSchema,
  validateCompatibleAttendanceInput,
} from "./attendance-status";

export const upsertSessionAttendanceDto = z.object({
  rows: z.array(
    z
      .object({
        childId: z.string().uuid("childId must be a valid uuid"),
        status: attendanceStatusSchema.optional(),
        present: z.boolean().optional(),
        correctionReason: correctionReasonSchema.optional(),
      })
      .superRefine(validateCompatibleAttendanceInput),
  ),
});

export type UpsertSessionAttendanceDto = z.infer<
  typeof upsertSessionAttendanceDto
>;
