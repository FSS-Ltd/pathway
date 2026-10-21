import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { belgiumRegions } from "./regions";
import { belgiumSectors } from "./shared";

export const belgiumRegionCoverage: TrackerCatalogue["coverage"] =
  belgiumRegions.flatMap(({ code: jurisdiction }) =>
    belgiumSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => ({
        jurisdiction,
        sector,
        topic,
        status: "IN_REVIEW" as const,
        regionalStatus: "IN_REVIEW" as const,
        regions: [],
        requiresRegion: false,
        reason:
          "Region and municipal duties for this topic have not been reviewed. Education and childcare may also depend on a separate language Community, which this geographic selection does not establish.",
        sourceIds: [],
        review: null,
      })),
    ),
  );
