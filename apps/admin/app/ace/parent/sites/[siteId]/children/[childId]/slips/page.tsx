"use client";

import { Card } from "@pathway/ui";
import { FamilySlipList } from "@/components/ace/trips/family-slip-list";

export default function FamilySlipsPage({
  params,
}: {
  params: { siteId: string; childId: string };
}) {
  if (process.env.NEXT_PUBLIC_ACE_TRIP_SLIP_WEB_ENABLED !== "true") {
    return (
      <main>
        <Card title="Trip permission slips are not available yet">
          <p className="text-sm text-text-muted">
            Your school will let you know when slips are ready here.
          </p>
        </Card>
      </main>
    );
  }
  return <FamilySlipList siteId={params.siteId} childId={params.childId} />;
}
