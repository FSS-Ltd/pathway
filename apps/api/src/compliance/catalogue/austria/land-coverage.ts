import { TRACKER_TOPICS } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { austriaLands } from "./lands";
import { austriaSectors } from "./shared";

export const austriaLandCoverage: TrackerCatalogue["coverage"] =
  austriaLands.flatMap(({ code: jurisdiction }) =>
    austriaSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => ({
        jurisdiction,
        sector,
        topic,
        status: "IN_REVIEW" as const,
        regionalStatus: "IN_REVIEW" as const,
        regions: [],
        requiresRegion: false,
        reason:
          "Land-specific duties and competent authorities for this topic have not been reviewed. Use the Austrian national core and confirm the route for the site's actual provision and address.",
        sourceIds: [],
        review: null,
      })),
    ),
  );
