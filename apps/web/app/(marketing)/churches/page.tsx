import SectorLandingPage from "../../../components/sector/SectorLandingPage";
import { getSectorById } from "../../../content/sectors";
import type { SectorDefinition } from "../../../content/sectors";
import { metadataForPath } from "../../../lib/seo";

const sectorResult = getSectorById("churches");

if (!sectorResult) {
  throw new Error("Sector 'churches' not found");
}

const sector: SectorDefinition = sectorResult;

export const metadata = metadataForPath("/churches");

export default function ChurchesPage() {
  return <SectorLandingPage sector={sector} />;
}
