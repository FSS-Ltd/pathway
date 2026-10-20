import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { polandInstitutionRequirements } from "./institution-requirements";
import { polandOperationalRequirements } from "./operations-requirements";
import { polandReview, polandSectors } from "./shared";

export { polandSources } from "./sources";
export const polandRequirements = [
  ...polandInstitutionRequirements,
  ...polandOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National school, preschool and under-three care routes reviewed. Gmina/powiat register decisions, operator status and local conditions remain site-specific.",
  safeguarding:
    "Child-protection standards and role-screening framework reviewed. Actual activity scope and local referral procedures remain in review.",
  personnel:
    "Article 21 checks, teacher CROD and under-three staffing routes reviewed. Individual roles, qualifications and authority decisions remain in review.",
  privacy_records:
    "GDPR and UODO school guidance reviewed. Controller-specific lawful bases, retention, DPIA/DPO and processor decisions remain site-specific.",
  premises_safety:
    "PIP risk and under-three premises routes reviewed. Building, sanitary, fire and occupancy decisions remain in review.",
  education_childcare:
    "Education-system and 2026 under-three care distinctions reviewed. Programme, staffing and local implementation remain in review.",
  activities:
    "Food, transport, school trips and organised-holiday routes reviewed. Site exceptions, registration and local conditions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for participants. Polish school status and qualification recognition need separate evidence.",
};

export const polandCoverage: TrackerCatalogue["coverage"] =
  polandSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "PL",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          polandRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: polandReview,
    })),
  );
