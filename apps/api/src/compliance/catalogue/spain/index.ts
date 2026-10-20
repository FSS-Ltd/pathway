import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { spainRequirements } from "./requirements";
import { spainRegionCodes, spainReview, spainSectors } from "./shared";
import { spainSources } from "./sources";

export { spainRequirements, spainSources, spainRegionCodes };

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National school and entity routes reviewed; autonomous-community authorisations, municipal decisions and provider classification remain in review.",
  safeguarding:
    "National LOPIVI entry points reviewed; autonomous-community referral and sector-specific procedures remain in review.",
  personnel:
    "Covered child-facing role check reviewed; professional qualifications, training and regional role rules remain in review.",
  privacy_records:
    "GDPR and Spain-specific education DPO trigger reviewed; processing, retention and conditional DPIA decisions remain site-specific.",
  premises_safety:
    "Employer risk and national building entry points reviewed; building class, fire thresholds and municipal decisions remain in review.",
  education_childcare:
    "National school and early-years frameworks reviewed; community curricula, childcare ratios and special provision remain in review.",
  activities:
    "Food and trip entry points reviewed; transport, boarding, camps and local activity permissions remain in review.",
  ace_icce:
    "ICCE terms reviewed for actual participants; Spanish qualification recognition and programme permissions remain separate decisions.",
};

const countryCoverage: TrackerCatalogue["coverage"] = spainSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "ES",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          spainRequirements
            .filter(
              (requirement) =>
                requirement.jurisdiction === "ES" &&
                requirement.topic === topic,
            )
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: spainReview,
    })),
);

const regionalCoverage: TrackerCatalogue["coverage"] = spainRegionCodes.flatMap(
  (jurisdiction) =>
    spainSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => {
        const sourceIds = spainRequirements
          .filter(
            (requirement) =>
              requirement.jurisdiction === jurisdiction &&
              requirement.topic === topic,
          )
          .flatMap((requirement) => requirement.sourceIds);
        return {
          jurisdiction,
          sector,
          topic,
          status:
            sourceIds.length > 0
              ? ("PARTIALLY_PUBLISHED" as const)
              : ("IN_REVIEW" as const),
          regionalStatus: "IN_REVIEW" as const,
          regions: [],
          requiresRegion: false,
          reason:
            sourceIds.length > 0
              ? "Territorial authority-check action published; autonomous-community and municipal substantive rules remain in review."
              : "Autonomous-community or city and municipal implementation remains in review; confirm with the competent authority.",
          sourceIds: [...new Set(sourceIds)],
          review: spainReview,
        };
      }),
    ),
);

export const spainCoverage = [...countryCoverage, ...regionalCoverage];
