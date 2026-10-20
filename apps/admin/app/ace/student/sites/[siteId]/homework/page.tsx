"use client";

import { StudentHomeworkWorkspace } from "@/components/ace/homework/student-homework-workspace";

export default function StudentHomeworkPage({
  params,
}: {
  params: { siteId: string };
}) {
  return <StudentHomeworkWorkspace siteId={params.siteId} />;
}
