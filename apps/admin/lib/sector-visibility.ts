import type { AdminOrgSector } from "./api-client";

/**
 * Feature-visibility mechanism driven by org sector. No sector currently hides or
 * shows anything — every key defaults to visible for every sector until product
 * defines real per-sector rules. Follows the same shape as the existing
 * `parentPortalEnabled` toggle: read the org's sector, look up a feature key here,
 * branch on the boolean in the component.
 */
export type SectorFeatureKey = "placeholder";

const SECTOR_FEATURES: Record<AdminOrgSector, Record<SectorFeatureKey, boolean>> = {
  CHURCH: { placeholder: true },
  CLUB: { placeholder: true },
  SCHOOL: { placeholder: true },
  CHARITY: { placeholder: true },
};

export function isFeatureVisibleForSector(
  sector: AdminOrgSector | null | undefined,
  feature: SectorFeatureKey,
): boolean {
  if (!sector) return true;
  return SECTOR_FEATURES[sector][feature];
}
