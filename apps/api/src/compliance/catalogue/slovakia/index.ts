import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { slovakiaRequirements } from "./requirements";
import { slovakiaRegionCodes, slovakiaReview, slovakiaSectors } from "./shared";
import { slovakiaSources } from "./sources";

export { slovakiaRequirements, slovakiaSources, slovakiaRegionCodes };

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "2026 school-register and under-three care entry points reviewed; municipality, founder and authority decisions remain in review.",
  safeguarding:
    "Child-rights notification entry point reviewed; school-specific protocols and local referral arrangements remain in review.",
  personnel:
    "Pedagogical role and integrity route reviewed; non-school role checks, qualifications and training remain in review.",
  privacy_records:
    "GDPR and Slovak data law reviewed; controller-specific lawful bases, retention, DPIA and DPO decisions remain site-specific.",
  premises_safety:
    "Employer safety, fire and child-facility health entry points reviewed; building and regional decisions remain in review.",
  education_childcare:
    "School Act and under-three social-service routes reviewed; programme, capacity and local decisions remain in review.",
  activities:
    "Food and residential-event entry points reviewed; transport, boarding, camps and event-specific permissions remain in review.",
  ace_icce:
    "ICCE terms reviewed for actual participants; Slovak qualification recognition remains a separate decision.",
};

const countryCoverage: TrackerCatalogue["coverage"] = slovakiaSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "SK",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          slovakiaRequirements
            .filter(
              (requirement) =>
                requirement.jurisdiction === "SK" &&
                requirement.topic === topic,
            )
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: slovakiaReview,
    })),
);

const regionalCoverage: TrackerCatalogue["coverage"] =
  slovakiaRegionCodes.flatMap((jurisdiction) =>
    slovakiaSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => {
        const regionalSources = slovakiaRequirements
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
              ? "Regional school-authority route reviewed; municipality and local decisions remain in review."
              : "Regional and municipality implementation remains in review; confirm with the competent authority.",
          sourceIds: [...new Set(regionalSources)],
          review: slovakiaReview,
        };
      }),
    ),
  );

export const slovakiaCoverage = [...countryCoverage, ...regionalCoverage];
