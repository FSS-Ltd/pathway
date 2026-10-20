import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { englandAuthorityCodes } from "./authorities";
import { englandSectors } from "./shared";

export const englandAuthorityCoverage: TrackerCatalogue["coverage"] =
  englandAuthorityCodes.flatMap((jurisdiction) =>
    englandSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => ({
        jurisdiction,
        sector,
        topic,
        status: "IN_REVIEW" as const,
        regionalStatus: "IN_REVIEW" as const,
        regions: [],
        requiresRegion: false,
        reason:
          "This council's topic-specific duties and local arrangements have not been reviewed. Use the England national core and confirm the competent authority for the site's actual provision.",
        sourceIds: [],
        review: null,
      })),
    ),
  );
