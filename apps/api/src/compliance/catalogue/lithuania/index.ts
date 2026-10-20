import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { lithuaniaInstitutionRequirements } from "./institution-requirements";
import { lithuaniaOperationalRequirements } from "./operations-requirements";
import { lithuaniaReview, lithuaniaSectors } from "./shared";

export { lithuaniaSources } from "./sources";
export const lithuaniaRequirements = [
  ...lithuaniaInstitutionRequirements,
  ...lithuaniaOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National provider and entity routes reviewed. Municipality decisions, programme permissions and site-specific classification remain in review.",
  safeguarding:
    "National child-rights and education entry points reviewed. Municipality referral procedures and activity-specific duties remain in review.",
  personnel:
    "Child-work QR and formal educator rules reviewed. Role classifications and programme-specific staffing decisions remain in review.",
  privacy_records:
    "GDPR and Lithuanian supervisory guidance reviewed. Controller-specific lawful bases, DPIA/DPO triggers and retention remain site-specific.",
  premises_safety:
    "Workplace, fire, school, preschool and camp health-safety routes reviewed. Site permits and local inspection conditions remain in review.",
  education_childcare:
    "Formal, preschool and non-formal routes reviewed. Municipality admissions, financing and programme decisions remain in review.",
  activities:
    "Food, transport, camp and trip entry points reviewed. Activity classification, permits and local implementation remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Lithuanian programme consent and recognition need external evidence.",
};

export const lithuaniaCoverage: TrackerCatalogue["coverage"] =
  lithuaniaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "LT",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          lithuaniaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: lithuaniaReview,
    })),
  );
