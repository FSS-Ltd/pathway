import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { swedenRequirements } from "./requirements";
import { swedenCountyCodes, swedenReview, swedenSectors } from "./shared";
import { swedenSources } from "./sources";

export { swedenRequirements, swedenSources, swedenCountyCodes };

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "School, preschool and pedagogical-care routes reviewed; municipal approval, legal form and site decisions remain in review.",
  safeguarding:
    "Current social-services reporting and Education Act protection entry points reviewed; municipality and specialist settings remain in review.",
  personnel:
    "Education-role extract and teacher qualification entry points reviewed; actual roles, non-school checks and local policy remain in review.",
  privacy_records:
    "GDPR and Swedish school privacy guidance reviewed; lawful bases, retention and conditional DPIA/DPO decisions remain site-specific.",
  premises_safety:
    "Employer risk and fire duties reviewed; building classification, accessibility and municipal fire decisions remain in review.",
  education_childcare:
    "School and preschool framework reviewed; school-form, specialist provision and municipal care rules remain in review.",
  activities:
    "Food-business and trip entry points reviewed; transport, boarding, camps and other activity permissions remain in review.",
  ace_icce:
    "ICCE terms reviewed for actual participants; Swedish qualification recognition remains a separate decision.",
};

const countryCoverage: TrackerCatalogue["coverage"] = swedenSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "SE",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          swedenRequirements
            .filter(
              (requirement) =>
                requirement.jurisdiction === "SE" &&
                requirement.topic === topic,
            )
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: swedenReview,
    })),
);

const countyCoverage: TrackerCatalogue["coverage"] = swedenCountyCodes.flatMap(
  (jurisdiction) =>
    swedenSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => {
        const sourceIds = swedenRequirements
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
              ? "County-level authority-check action published; substantive municipal and specialist rules remain in review."
              : "County and municipal implementation remains in review; confirm with the competent authority.",
          sourceIds: [...new Set(sourceIds)],
          review: swedenReview,
        };
      }),
    ),
);

export const swedenCoverage = [...countryCoverage, ...countyCoverage];
