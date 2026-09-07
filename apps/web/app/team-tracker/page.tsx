import TeamTrackerLanding from "./team-tracker-landing";
import { metadataForPath } from "../../lib/seo";

export const metadata = metadataForPath("/team-tracker");

export default function TeamTrackerPage() {
  return <TeamTrackerLanding />;
}
