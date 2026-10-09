"use client";

import { FamilySubjectTimetableWorkspace } from "@/components/ace/timetable/family-subject-timetable-workspace";

export default function StudentSubjectTimetablePage({
  params,
}: {
  params: { siteId: string };
}) {
  return (
    <FamilySubjectTimetableWorkspace
      scope={{ kind: "student", siteId: params.siteId }}
    />
  );
}
