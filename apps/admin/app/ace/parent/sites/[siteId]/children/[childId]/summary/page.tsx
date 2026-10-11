"use client";

import { FamilySummaryWorkspace } from "@/components/ace/family/family-summary-workspace";

export default function ParentSummaryPage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  return (
    <FamilySummaryWorkspace siteId={params.siteId} childId={params.childId} />
  );
}
