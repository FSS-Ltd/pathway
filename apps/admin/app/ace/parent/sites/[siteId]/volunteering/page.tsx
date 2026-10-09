"use client";

import { SchoolVolunteeringWorkspace } from "@/components/ace/family/school-volunteering-workspace";

export default function ParentSchoolVolunteeringPage({
  params,
}: {
  params: { siteId: string };
}) {
  return (
    <SchoolVolunteeringWorkspace key={params.siteId} siteId={params.siteId} />
  );
}
