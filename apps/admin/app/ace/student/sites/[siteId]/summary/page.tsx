"use client";

import { StudentSelfSummaryWorkspace } from "@/components/ace/family/student-self-summary-workspace";

export default function StudentSummaryPage({
  params,
}: {
  params: { siteId: string };
}) {
  return <StudentSelfSummaryWorkspace siteId={params.siteId} />;
}
