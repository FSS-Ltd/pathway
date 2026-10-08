import type {
  DailyAbsenceReason,
  DailyAttendanceStatus,
} from "@/lib/daily-attendance-api";

export const dailyStatusLabel: Record<DailyAttendanceStatus, string> = {
  PRESENT: "Present",
  ABSENT: "Absent",
  LATE: "Late",
};

export const dailyAbsenceLabel: Record<DailyAbsenceReason, string> = {
  SICK: "Sick",
  HOLIDAY: "Holiday",
  NOT_SCHEDULED: "Not scheduled",
  EXCUSED: "Excused",
  UNEXCUSED: "Unexcused",
};

export const dailyAbsenceReasons = Object.entries(dailyAbsenceLabel) as Array<
  [DailyAbsenceReason, string]
>;
