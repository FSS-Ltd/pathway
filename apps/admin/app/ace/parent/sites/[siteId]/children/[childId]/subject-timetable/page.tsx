"use client";

import { FamilySubjectTimetableWorkspace } from "@/components/ace/timetable/family-subject-timetable-workspace";

export default function ParentSubjectTimetablePage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  return (
    <FamilySubjectTimetableWorkspace
      scope={{ kind: "parent", siteId: params.siteId, childId: params.childId }}
    />
  );
}
