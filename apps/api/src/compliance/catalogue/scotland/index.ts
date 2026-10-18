import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { scotlandReview, scotlandSectors } from "./shared";
import { coreRequirements } from "./core";
import { operationsRequirements } from "./operations";
import { provisionRequirements } from "./provision";

export { scotlandSources } from "./sources";
export const scotlandRequirements: TrackerCatalogue["requirements"] = [
  ...coreRequirements,
  ...operationsRequirements,
  ...provisionRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National independent-school and care-service routes reviewed. Actual legal classification, local permissions, charity and specialist registrations remain site-specific.",
  safeguarding:
    "National child-protection and independent-school guidance reviewed. Local Child Protection Committee referrals, allegations procedures and specialist-service duties remain unreviewed.",
  personnel:
    "PVG regulated-role and independent-school teacher routes reviewed. Individual duties, exceptions, care-workforce registration and training terms require case review.",
  privacy_records:
    "Core UK controller duties reviewed. Actual roles, rights requests, DPIA/DPO, transfers and specialist records require further review.",
  premises_safety:
    "Employer risk, first aid, Scottish fire and school accessibility routes reviewed. Shared premises, building, medical and local permissions remain site-specific.",
  education_childcare:
    "School attendance, education-authority support, care conditions and funded ELC routes reviewed. Curriculum, service ratios, specialist provision and council contracts remain incomplete.",
  activities:
    "Food business, trips, own vehicles and school care accommodation reviewed. Activity licences, local food controls, residential classifications and operator terms remain site-specific.",
  ace_icce:
    "Public ICCE provider requirements reviewed for participants. Actual ACE agreements, local approvals and entity-specific provider terms require external evidence.",
};

export const scotlandCoverage: TrackerCatalogue["coverage"] =
  scotlandSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "GB-SCT",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          scotlandRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: scotlandReview,
    })),
  );
