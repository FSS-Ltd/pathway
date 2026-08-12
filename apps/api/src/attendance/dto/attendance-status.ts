import { z } from "zod";

export const attendanceStatusSchema = z.enum(["PRESENT", "ABSENT", "LATE"]);

export type AttendanceStatus = z.infer<typeof attendanceStatusSchema>;

export const correctionReasonSchema = z
  .string()
  .trim()
  .min(1, "correctionReason must not be blank")
  .max(500, "correctionReason must be at most 500 characters");

export function attendanceStatusFromPresent(
  present: boolean,
): AttendanceStatus {
  return present ? "PRESENT" : "ABSENT";
}

export function presentFromAttendanceStatus(status: AttendanceStatus): boolean {
  return status !== "ABSENT";
}

export function validateCompatibleAttendanceInput(
  input: { status?: AttendanceStatus; present?: boolean },
  context: z.RefinementCtx,
): void {
  if (input.status === undefined && input.present === undefined) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "status or present is required",
      path: ["status"],
    });
    return;
  }

  if (
    input.status !== undefined &&
    input.present !== undefined &&
    presentFromAttendanceStatus(input.status) !== input.present
  ) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "status and present must describe the same attendance state",
      path: ["present"],
    });
  }
}
