import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { northernIrelandDistricts } from "./districts";
import { northernIrelandSectors } from "./shared";

export const northernIrelandDistrictCoverage: TrackerCatalogue["coverage"] =
  northernIrelandDistricts.flatMap(({ code: jurisdiction }) =>
    northernIrelandSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => ({
        jurisdiction,
        sector,
        topic,
        status: "IN_REVIEW" as const,
        regionalStatus: "IN_REVIEW" as const,
        regions: [],
        requiresRegion: false,
        reason:
          "Whether this district has topic-specific duties or local arrangements has not been reviewed. Use the Northern Ireland national core and confirm the competent authority for the site's actual provision.",
        sourceIds: [],
        review: null,
      })),
    ),
  );
