"use client";

import { FamilyAttendanceWorkspace } from "@/components/ace/attendance/family-attendance-workspace";

export default function StudentAttendancePage({
  params,
}: {
  params: { siteId: string };
}) {
  return (
    <FamilyAttendanceWorkspace
      scope={{ kind: "student", siteId: params.siteId }}
    />
  );
}
