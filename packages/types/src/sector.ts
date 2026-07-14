/**
 * Organisation sector, selected once at initial plan purchase (see @pathway/db OrgSector).
 * Drives which features are visible to the org. Kept as a plain string union here (rather
 * than importing the Prisma enum) so this package stays dependency-free for frontend use.
 */
export type Sector = "CHURCH" | "CLUB" | "SCHOOL" | "CHARITY";

export const SECTOR_LABELS: Record<Sector, string> = {
  CHURCH: "Church",
  CLUB: "Club",
  SCHOOL: "School",
  CHARITY: "Charity",
};

export const SECTOR_OPTIONS: { value: Sector; label: string }[] = (
  Object.keys(SECTOR_LABELS) as Sector[]
).map((value) => ({ value, label: SECTOR_LABELS[value] }));

export function isSector(value: unknown): value is Sector {
  return typeof value === "string" && value in SECTOR_LABELS;
}
