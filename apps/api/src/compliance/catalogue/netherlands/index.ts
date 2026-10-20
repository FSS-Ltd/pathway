import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { netherlandsInstitutionRequirements } from "./institution-requirements";
import { netherlandsOperationalRequirements } from "./operations-requirements";
import { netherlandsReview, netherlandsSectors } from "./shared";

export { netherlandsSources } from "./sources";
export const netherlandsRequirements = [
  ...netherlandsInstitutionRequirements,
  ...netherlandsOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National B3/B4, funded-school and LRK routes reviewed. Municipal permits, school classification decisions and legal form remain site-specific.",
  safeguarding:
    "Meldcode and school safety routes reviewed. Exact institution and incident handling and local referral routes remain in review.",
  personnel:
    "School VOG and childcare PRK, qualification routes reviewed. Individual role, structural presence and current GGD decisions remain in review.",
  privacy_records:
    "GDPR and AP guidance reviewed. Controller-specific lawful bases, retention, DPIA/DPO and processor decisions remain site-specific.",
  premises_safety:
    "Arbowet, current Bbl and childcare premises routes reviewed. Municipal plan, occupancy and fire-use decisions remain in review.",
  education_childcare:
    "National funded/B3/B4 school and registered childcare distinctions reviewed. Programme, BKR and municipal implementation remain in review.",
  activities:
    "NVWA food, commercial/own-account transport and trip routes reviewed. Site exceptions and local conditions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for participants. Dutch school status and qualification recognition need separate evidence.",
};

export const netherlandsCoverage: TrackerCatalogue["coverage"] =
  netherlandsSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "NL",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          netherlandsRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: netherlandsReview,
    })),
  );
