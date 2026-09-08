/**
 * Trial waitlist page - will later become self-serve onboarding wizard (Milestone 6).
 * Currently a waitlist form; future versions will support self-serve tenant creation.
 */

import TrialPageClient from "./trial-page-client";
import { metadataForPath } from "../../../lib/seo";

export const metadata = metadataForPath("/trial");

export default function TrialPage() {
  return <TrialPageClient />;
}
