import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { hungaryReview, hungarySectors } from "./shared";
import { hungaryInstitutionRequirements } from "./institution-requirements";
import { hungaryOperationalRequirements } from "./operations-requirements";

export { hungarySources } from "./sources";
export const hungaryRequirements = [
  ...hungaryInstitutionRequirements,
  ...hungaryOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Public education, childcare and organised training entry routes reviewed. County and municipal permissions, current adult-training authority and operator-specific decisions remain in review.",
  safeguarding:
    "Child-welfare signalling and school records reviewed. Local referral arrangements and service-specific protection practice remain in review.",
  personnel:
    "School and care role routes reviewed. Current role suitability, county interpretation and detailed qualification schedules remain in review.",
  privacy_records:
    "GDPR and NAIH breach/DPIA guidance reviewed. Controller-specific lawful bases, DPO triggers and sectoral retention decisions remain in review.",
  premises_safety:
    "Employer risk assessment and school-permit site conditions reviewed. Fire, building, accessibility, first aid and local health decisions remain in review.",
  education_childcare:
    "School, care and organised training routes reviewed. Curriculum, inclusion, staffing ratios and county/municipal conditions remain in review.",
  activities:
    "EU food hygiene and child-activity classification reviewed. Transport, residential, camp and local food permissions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Hungarian qualification recognition and site-specific permission require external evidence.",
};

export const hungaryCoverage: TrackerCatalogue["coverage"] =
  hungarySectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "HU",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          hungaryRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: hungaryReview,
    })),
  );
