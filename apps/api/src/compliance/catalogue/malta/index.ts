import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { maltaInstitutionRequirements } from "./institution-requirements";
import { maltaOperationalRequirements } from "./operations-requirements";
import { maltaReview, maltaSectors } from "./shared";

export { maltaSources } from "./sources";
export const maltaRequirements = [
  ...maltaInstitutionRequirements,
  ...maltaOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National school, ECEC, MFHEA and voluntary-organisation routes reviewed. Local-council and licence-specific decisions remain in review.",
  safeguarding:
    "National child-protection routes reviewed. Site-specific referral and local practice remain in review.",
  personnel:
    "Role-based POMA and teaching-warrant routes reviewed. Individual roles, setting conditions and foreign records remain in review.",
  privacy_records:
    "GDPR and Malta IDPC routes reviewed. Controller-specific bases, retention and DPIA/DPO decisions remain site-specific.",
  premises_safety:
    "National workplace and school/ECEC premises routes reviewed. Planning, fire and local inspection conditions remain in review.",
  education_childcare:
    "School, ECEC, non-formal and MFHEA distinctions reviewed. Particular licences, courses and local implementation remain in review.",
  activities:
    "Food, transport and trip routes reviewed. Activity-specific permits and local council conditions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for participants. Maltese licence and qualification recognition require separate evidence.",
};

export const maltaCoverage: TrackerCatalogue["coverage"] = maltaSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "MT",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          maltaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: maltaReview,
    })),
);
