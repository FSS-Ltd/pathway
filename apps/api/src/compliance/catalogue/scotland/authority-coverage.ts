import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { scotlandCouncilAreas } from "./authorities";
import { scotlandSectors } from "./shared";

export const scotlandAuthorityCoverage: TrackerCatalogue["coverage"] =
  scotlandCouncilAreas.flatMap(({ code: jurisdiction }) =>
    scotlandSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => ({
        jurisdiction,
        sector,
        topic,
        status: "IN_REVIEW" as const,
        regionalStatus: "IN_REVIEW" as const,
        regions: [],
        requiresRegion: false,
        reason:
          "This council area's topic-specific duties and local arrangements have not been reviewed. Use the Scotland national core and confirm the competent authority for the site's actual provision.",
        sourceIds: [],
        review: null,
      })),
    ),
  );
