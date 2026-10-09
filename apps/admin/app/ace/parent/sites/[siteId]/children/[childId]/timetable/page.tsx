"use client";

import { FamilyTimetableWorkspace } from "@/components/ace/timetable/family-timetable-workspace";

export default function ParentTimetablePage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  return (
    <FamilyTimetableWorkspace
      scope={{ kind: "parent", siteId: params.siteId, childId: params.childId }}
    />
  );
}
