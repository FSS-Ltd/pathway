"use client";

import { FamilySummaryWorkspace } from "@/components/ace/family/family-summary-workspace";
import { ParentChildNavigation } from "@/components/ace/family/parent-child-navigation";

export default function FamilyChildOverviewPage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  return (
    <>
      <ParentChildNavigation
        siteId={params.siteId}
        childId={params.childId}
        section="parent-summary"
      />
      <FamilySummaryWorkspace
        siteId={params.siteId}
        childId={params.childId}
        includeAceServices={false}
      />
    </>
  );
}
