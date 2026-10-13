import {
  institutionalSector,
  isSector,
  isVertical,
  type Sector,
  type InstitutionalVertical,
} from "@pathway/types";

/** Validate frozen identity before provisioning; older sector-only orders remain valid. */
export function pendingOrganisationProfile(
  details: Record<string, unknown>,
  frozenSetting?: InstitutionalVertical,
): { sector?: Sector; vertical?: InstitutionalVertical } {
  const sector = isSector(details.sector) ? details.sector : undefined;
  const storedVertical = details.vertical;
  if (
    storedVertical !== undefined &&
    storedVertical !== "" &&
    (!isVertical(storedVertical) || storedVertical === "HOME_EDUCATION")
  ) {
    throw new Error("Invalid institutional provider type");
  }
  const vertical =
    frozenSetting ?? (isVertical(storedVertical) ? storedVertical : undefined);
  if (frozenSetting && storedVertical && storedVertical !== frozenSetting) {
    throw new Error("Institutional provider type requires review");
  }
  if (vertical && sector !== institutionalSector(vertical)) {
    throw new Error("Institutional sector and provider type do not match");
  }
  if (sector === "LEARNING_CENTRE" && !vertical) {
    throw new Error("Learning centre provider type is required");
  }
  return { sector, vertical };
}
