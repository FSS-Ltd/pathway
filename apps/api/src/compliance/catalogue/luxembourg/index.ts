import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { luxembourgInstitutionRequirements } from "./institution-requirements";
import { luxembourgOperationalRequirements } from "./operations-requirements";
import { luxembourgReview, luxembourgSectors } from "./shared";

export { luxembourgSources } from "./sources";
export const luxembourgRequirements = [
  ...luxembourgInstitutionRequirements,
  ...luxembourgOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National school, SEA and operator routes reviewed. Commune and site-specific authorisation decisions remain in review.",
  safeguarding:
    "National child-protection entry points reviewed. Local referral practice and institution-specific procedures remain in review.",
  personnel:
    "Role-based Bulletin 5 and SEA personnel rules reviewed. Individual role and foreign-record decisions remain in review.",
  privacy_records:
    "GDPR and CNPD obligations reviewed. Controller-specific lawful bases, retention and DPIA/DPO decisions remain site-specific.",
  premises_safety:
    "Employer and SEA premises routes reviewed. Site approvals, fire conditions and local inspection instructions remain in review.",
  education_childcare:
    "Public/private school, SEA and out-of-school distinctions reviewed. Commune admissions and programme conditions remain in review.",
  activities:
    "Food, transport and trip routes reviewed. Activity-specific permits and local implementation remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Luxembourg recognition must be evidenced separately.",
};

export const luxembourgCoverage: TrackerCatalogue["coverage"] =
  luxembourgSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "LU",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          luxembourgRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: luxembourgReview,
    })),
  );
