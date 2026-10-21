import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { irelandLocalAuthorities } from "./local-authorities";
import { irelandSectors } from "./shared";

export const irelandLocalAuthorityCoverage: TrackerCatalogue["coverage"] =
  irelandLocalAuthorities.flatMap(({ code: jurisdiction }) =>
    irelandSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => ({
        jurisdiction,
        sector,
        topic,
        status: "IN_REVIEW" as const,
        regionalStatus: "IN_REVIEW" as const,
        regions: [],
        requiresRegion: false,
        reason:
          "Whether this local authority has topic-specific duties or decisions has not been reviewed. Use the Ireland national core and confirm the competent authority for the site's actual provision.",
        sourceIds: [],
        review: null,
      })),
    ),
  );
