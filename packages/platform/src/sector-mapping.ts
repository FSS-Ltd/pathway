import type { OrgSector, Vertical } from "@prisma/client";

// SCHOOL splits three ways (Independent/ACE/State). There are no existing SCHOOL
// orgs, so SCHOOL is set at signup / via Phase 2's vertical picker, never backfilled.
const DIRECT: Partial<Record<OrgSector, Vertical>> = {
  CHURCH: "CHURCH",
  CLUB: "CLUB",
  CHARITY: "CHARITY",
};

export function sectorToVertical(sector: OrgSector): Vertical | null {
  return DIRECT[sector] ?? null;
}
