import SectorLandingPage from "../../../components/sector/SectorLandingPage";
import { getSectorById } from "../../../content/sectors";
import type { SectorDefinition } from "../../../content/sectors";
import { metadataForPath } from "../../../lib/seo";

const sectorResult = getSectorById("schools");

if (!sectorResult) {
  throw new Error("Sector 'schools' not found");
}

const sector: SectorDefinition = sectorResult;

export const metadata = metadataForPath("/schools");

export default function SchoolsPage() {
  return <SectorLandingPage sector={sector} />;
}
