import SectorLandingPage from "../../../components/sector/SectorLandingPage";
import { getSectorById } from "../../../content/sectors";
import type { SectorDefinition } from "../../../content/sectors";
import { metadataForPath } from "../../../lib/seo";

const sectorResult = getSectorById("charities");

if (!sectorResult) {
  throw new Error("Sector 'charities' not found");
}

const sector: SectorDefinition = sectorResult;

export const metadata = metadataForPath("/charities");

export default function CharitiesPage() {
  return <SectorLandingPage sector={sector} />;
}
