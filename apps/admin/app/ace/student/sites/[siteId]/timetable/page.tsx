"use client";

import { FamilyTimetableWorkspace } from "@/components/ace/timetable/family-timetable-workspace";

export default function StudentTimetablePage({
  params,
}: {
  params: { siteId: string };
}) {
  return (
    <FamilyTimetableWorkspace
      scope={{ kind: "student", siteId: params.siteId }}
    />
  );
}
