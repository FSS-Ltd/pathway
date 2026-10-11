export const UNAVAILABLE_STUDENT_SECTIONS = {
  homework: { status: "unavailable" },
  pace: { status: "unavailable" },
  faith: { status: "unavailable" },
  reports: { status: "unavailable" },
  slips: { status: "unavailable" },
  community: { status: "unavailable" },
} as const;

export function isStudentAttendanceEnabled(): boolean {
  return process.env.ACE_STUDENT_FACADE_ATTENDANCE_ENABLED !== "false";
}
