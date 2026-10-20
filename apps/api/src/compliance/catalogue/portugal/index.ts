import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { portugalInstitutionRequirements } from "./institution-requirements";
import { portugalOperationalRequirements } from "./operations-requirements";
import {
  mainlandDistrictCodes,
  portugalReview,
  portugalSectors,
} from "./shared";

export { portugalSources } from "./sources";
export { mainlandDistrictCodes } from "./shared";
export const portugalRequirements = [
  ...portugalInstitutionRequirements,
  ...portugalOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National social-response and mainland private-school routes reviewed, with distinct Azores and Madeira entry points. Site, municipal and regional authority decisions remain in review.",
  safeguarding:
    "Child-protection law and referral entry points reviewed. Role-specific reporting, local CPCJ arrangements and regional implementation remain in review.",
  personnel:
    "Regular-child-contact criminal-record duty reviewed. Qualifications, care ratios and regional employment conditions remain in review.",
  privacy_records:
    "GDPR and Portuguese data law reviewed. Controller-specific lawful bases, retention and conditional DPIA/DPO decisions remain site-specific.",
  premises_safety:
    "Employer risk and fire-safety entry points reviewed. Building use, capacity, accessibility and local approvals remain in review.",
  education_childcare:
    "Curriculum, inclusion and creche entry points reviewed. Autonomous-region rules, CATL staffing and local programme decisions remain in review.",
  activities:
    "Food and 2026 child-transport entry points reviewed. Trips, boarding, camps and local food permissions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Portuguese qualification recognition and site permission require separate evidence.",
};

export const portugalRegionCodes = [
  ...mainlandDistrictCodes,
  "PT-AZO",
  "PT-MAD",
];

const countryCoverage: TrackerCatalogue["coverage"] = portugalSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "PT",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          portugalRequirements
            .filter(
              (requirement) =>
                requirement.jurisdiction === "PT" &&
                requirement.topic === topic,
            )
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: portugalReview,
    })),
);

const regionalCoverage: TrackerCatalogue["coverage"] =
  portugalRegionCodes.flatMap((jurisdiction) =>
    portugalSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => {
        const regionalSources = portugalRequirements
          .filter(
            (requirement) =>
              requirement.jurisdiction === jurisdiction &&
              requirement.topic === topic,
          )
          .flatMap((requirement) => requirement.sourceIds);
        const hasReviewedRegionalAction = regionalSources.length > 0;
        return {
          jurisdiction,
          sector,
          topic,
          status: hasReviewedRegionalAction
            ? ("PARTIALLY_PUBLISHED" as const)
            : ("IN_REVIEW" as const),
          regionalStatus: "IN_REVIEW" as const,
          regions: [],
          requiresRegion: false,
          reason: hasReviewedRegionalAction
            ? "Regional entry route reviewed; local and service-specific decisions remain in review."
            : "Regional topic rules and local implementation remain in review; use the national core and confirm with the territorial authority.",
          sourceIds: hasReviewedRegionalAction
            ? [...new Set(regionalSources)]
            : [],
          review: portugalReview,
        };
      }),
    ),
  );

export const portugalCoverage = [...countryCoverage, ...regionalCoverage];
