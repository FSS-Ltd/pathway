import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { sloveniaRequirements } from "./requirements";
import { sloveniaRegionCodes, sloveniaReview, sloveniaSectors } from "./shared";
import { sloveniaSources } from "./sources";

export { sloveniaRequirements, sloveniaSources, sloveniaRegionCodes };

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Education-register and preschool routes reviewed; municipality, founder, programme and authority decisions remain in review.",
  safeguarding:
    "Child-protection reporting and school protocol entry points reviewed; local referral routes remain in review.",
  personnel:
    "Covered education-staff conditions reviewed; non-school role checks and training remain in review.",
  privacy_records:
    "GDPR and ZVOP-2 reviewed; lawful bases, retention, DPIA and DPO decisions remain site-specific.",
  premises_safety:
    "Employer risk and fire entry points reviewed; building classification and local decisions remain in review.",
  education_childcare:
    "School and preschool routes reviewed; programme, capacity and municipal rules remain in review.",
  activities:
    "Food-business and trip entry points reviewed; transport, boarding, camps and activity-specific permissions remain in review.",
  ace_icce:
    "ICCE terms reviewed for actual participants; Slovenian qualification recognition remains a separate decision.",
};

const countryCoverage: TrackerCatalogue["coverage"] = sloveniaSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "SI",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          sloveniaRequirements
            .filter(
              (requirement) =>
                requirement.jurisdiction === "SI" &&
                requirement.topic === topic,
            )
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: sloveniaReview,
    })),
);

const regionalCoverage: TrackerCatalogue["coverage"] =
  sloveniaRegionCodes.flatMap((jurisdiction) =>
    sloveniaSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => {
        const regionalSources = sloveniaRequirements
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
            regionalSources.length > 0
              ? ("PARTIALLY_PUBLISHED" as const)
              : ("IN_REVIEW" as const),
          regionalStatus: "IN_REVIEW" as const,
          regions: [],
          requiresRegion: false,
          reason:
            regionalSources.length > 0
              ? "Territorial school-authority route reviewed; municipality and local decisions remain in review."
              : "Regional and municipal implementation remains in review; confirm with the competent authority.",
          sourceIds: [...new Set(regionalSources)],
          review: sloveniaReview,
        };
      }),
    ),
  );

export const sloveniaCoverage = [...countryCoverage, ...regionalCoverage];
