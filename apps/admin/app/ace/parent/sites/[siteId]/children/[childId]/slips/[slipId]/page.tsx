"use client";

import { Card } from "@pathway/ui";
import { FamilySlipDetail } from "@/components/ace/trips/family-slip-detail";

export default function FamilySlipPage({
  params,
}: {
  params: { siteId: string; childId: string; slipId: string };
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
  return (
    <FamilySlipDetail
      siteId={params.siteId}
      childId={params.childId}
      slipId={params.slipId}
    />
  );
}
