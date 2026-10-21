import { Card } from "@pathway/ui";
import { TripSlipWorkspace } from "@/components/ace/trips/trip-slip-workspace";

export default function AceTripsPage() {
  if (process.env.NEXT_PUBLIC_ACE_TRIP_SLIP_WEB_ENABLED !== "true") {
    return (
      <main>
        <Card title="Trip permission slips are not available yet" />
      </main>
    );
  }
  return <TripSlipWorkspace />;
}
