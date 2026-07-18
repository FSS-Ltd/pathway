import { prisma } from "./db";
import { sectorToVertical } from "./sector-mapping";

export async function backfillOrgVertical() {
  const orgs = await prisma.org.findMany({ select: { id: true, sector: true } });
  let written = 0;
  let skipped = 0;

  for (const org of orgs) {
    const vertical = org.sector ? sectorToVertical(org.sector) : null;
    if (!vertical) {
      // null-sector orgs and SCHOOL (splits three ways, no existing SCHOOL orgs)
      // get a vertical at next Org Settings save (Phase 2), not here.
      skipped++;
      continue;
    }
    await prisma.orgVertical.upsert({
      where: { orgId: org.id },
      create: { orgId: org.id, vertical },
      update: {},
    });
    written++;
  }

  console.log(`org-vertical backfill: wrote/kept ${written}, skipped ${skipped}`);
  return { written, skipped };
}
