import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { italyReview, italySectors } from "./shared";
import { italyInstitutionRequirements } from "./institution-requirements";
import { italyOperationalRequirements } from "./operations-requirements";

export { italySources } from "./sources";
export const italyRequirements = [
  ...italyInstitutionRequirements,
  ...italyOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "School parity and non-parity, birth-to-six and vocational-accreditation entry routes reviewed. Each regional school office, autonomous province and municipality's procedures remain in review.",
  safeguarding:
    "National school bullying route reviewed. Regional child-protection practice, mandatory referral duties by role and local services remain in review.",
  personnel:
    "Role-specific Article 25-bis certificate trigger and school staffing core reviewed. Regional care qualifications, ratios and provider-specific checks remain in review.",
  privacy_records:
    "GDPR, Garante breach guidance and school privacy guidance reviewed. Controller-specific lawful bases, DPO/DPIA triggers and sectoral retention remain site-specific.",
  premises_safety:
    "Employer risk assessment and school/nursery fire entry points reviewed. Regional and municipal building, fire, accessibility and health decisions remain in review.",
  education_childcare:
    "National school and birth-to-six entry points reviewed. Each region/autonomous province's curricula, inclusion, ratios and inspection conditions remain in review.",
  activities:
    "EU food hygiene and activity-classification entry points reviewed. Transport, boarding, camp and local food/health permissions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Italian qualification recognition and site-specific permission require external evidence.",
};

export const italyCoverage: TrackerCatalogue["coverage"] = italySectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "IT",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          italyRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: italyReview,
    })),
);
