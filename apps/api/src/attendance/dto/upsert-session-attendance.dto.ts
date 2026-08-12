import { z } from "zod";
import {
  attendanceStatusSchema,
  correctionReasonSchema,
  validateCompatibleAttendanceInput,
} from "./attendance-status";

export const upsertSessionAttendanceDto = z.object({
  rows: z
    .array(
      z
        .object({
          childId: z.string().uuid("childId must be a valid uuid"),
          status: attendanceStatusSchema.optional(),
          present: z.boolean().optional(),
          correctionReason: correctionReasonSchema.optional(),
        })
        .superRefine(validateCompatibleAttendanceInput),
    )
    .superRefine((rows, context) => {
      const seenChildIds = new Set<string>();
      rows.forEach((row, index) => {
        if (seenChildIds.has(row.childId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: "childId must be unique within an attendance batch",
            path: [index, "childId"],
          });
        }
        seenChildIds.add(row.childId);
      });
    }),
});

export type UpsertSessionAttendanceDto = z.infer<
  typeof upsertSessionAttendanceDto
>;
