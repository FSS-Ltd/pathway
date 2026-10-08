"use client";

import { FamilyAttendanceWorkspace } from "@/components/ace/attendance/family-attendance-workspace";

export default function ParentAttendancePage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  return (
    <FamilyAttendanceWorkspace
      scope={{ kind: "parent", siteId: params.siteId, childId: params.childId }}
    />
  );
}
