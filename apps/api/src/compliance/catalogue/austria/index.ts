import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { austriaReview, austriaSectors } from "./shared";
import { coreRequirements } from "./core";
import { operationsRequirements } from "./operations";
import { provisionRequirements } from "./provision";

export { austriaSources } from "./sources";
export const austriaRequirements: TrackerCatalogue["requirements"] = [
  ...coreRequirements,
  ...operationsRequirements,
  ...provisionRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "2026 private-school definition and notice route reviewed. The 2027 amendment, Land service licences, public status and specialist permissions need further assessment.",
  safeguarding:
    "School child-protection concept reviewed conditionally. Private-school scope, Land childcare safeguarding and local reporting routes remain incomplete.",
  personnel:
    "Special child and youth welfare certificate route reviewed. Role-specific mandatory checks, qualifications and Land childcare staffing rules remain incomplete.",
  privacy_records:
    "Core EU GDPR controller duties reviewed. Austrian-law conditions, data rights, DPIA/DPO, transfers and specialist records remain incomplete.",
  premises_safety:
    "Federal employer risk and first-aid duties reviewed. All nine Land building, fire and accessibility codes plus local permits remain in review.",
  education_childcare:
    "School attendance and Land childcare classification reviewed. Recognition, curricula, inclusion, staffing ratios and nine Land permit regimes remain incomplete.",
  activities:
    "Core EU food hygiene and trip planning reviewed. Land youth rules, specialist food approval, transport and boarding remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Entity-specific approval and Austrian school recognition require external evidence.",
};

export const austriaCoverage: TrackerCatalogue["coverage"] =
  austriaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "AT",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          austriaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: austriaReview,
    })),
  );
