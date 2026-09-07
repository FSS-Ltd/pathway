import SectorLandingPage from "../../../components/sector/SectorLandingPage";
import { getSectorById } from "../../../content/sectors";
import type { SectorDefinition } from "../../../content/sectors";
import { metadataForPath } from "../../../lib/seo";

const sectorResult = getSectorById("clubs");

if (!sectorResult) {
  throw new Error("Sector 'clubs' not found");
}

const sector: SectorDefinition = sectorResult;

export const metadata = metadataForPath("/clubs");

export default function ClubsPage() {
  return <SectorLandingPage sector={sector} />;
}
