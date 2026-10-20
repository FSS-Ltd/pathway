import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { latviaInstitutionRequirements } from "./institution-requirements";
import { latviaOperationalRequirements } from "./operations-requirements";
import { latviaReview, latviaSectors } from "./shared";

export { latviaSources } from "./sources";
export const latviaRequirements = [
  ...latviaInstitutionRequirements,
  ...latviaOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National education, child-supervision and entity-status routes reviewed. All 42 local governments' programme permissions and site-specific decisions remain in review.",
  safeguarding:
    "National child-protection and education-institution safety routes reviewed. Municipal referral practice and activity-specific procedures remain in review.",
  personnel:
    "Role-specific Punishment Register and educator routes reviewed. Service-specific qualifications and local staffing decisions remain in review.",
  privacy_records:
    "GDPR and Data State Inspectorate school guidance reviewed. Controller-specific lawful bases, DPIA/DPO triggers and retention remain site-specific.",
  premises_safety:
    "Workplace, fire, first-aid and preschool hygiene entry points reviewed. Site and municipality-specific inspection conditions remain in review.",
  education_childcare:
    "Formal school, preschool and child-supervision entry points reviewed. Programme decisions, capacity and local implementation remain in review.",
  activities:
    "Food-business, school-event and children's-camp routes reviewed. Camp exceptions, transport and local activity permissions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Latvian recognition and site-specific permission need external evidence.",
};

export const latviaCoverage: TrackerCatalogue["coverage"] =
  latviaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "LV",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          latviaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: latviaReview,
    })),
  );
