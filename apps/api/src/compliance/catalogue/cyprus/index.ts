import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { cyprusReview, cyprusSectors } from "./shared";
import { cyprusRequirements } from "./requirements";

export { cyprusRequirements } from "./requirements";
export { cyprusSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Private school and institute routes identified. Actual provider classification, approval changes and district conditions remain incomplete.",
  safeguarding:
    "Police safeguarding route reviewed. Institution-specific reporting duties, district contacts and training remain incomplete.",
  personnel:
    "Day-care clearance and qualification evidence identified. Other roles, validity rules, health checks and training need authority validation.",
  privacy_records:
    "Core EU GDPR controller duties reviewed. Cyprus detail on DPO, DPIA, breaches, data rights and specialist records remains incomplete.",
  premises_safety:
    "Employer risk assessment and day-care premises documents reviewed. Building, fire, accessibility and health conditions need district review.",
  education_childcare:
    "School and two day-care registration routes identified. Programme detail, ratios, inclusion, inspections and district rules remain incomplete.",
  activities:
    "Food-business registration and EU hygiene core reviewed. Trips, transport, boarding, youth activities and specialist food approvals remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Cyprus school recognition and entity-specific ICCE approval require external evidence.",
};

export const cyprusCoverage: TrackerCatalogue["coverage"] =
  cyprusSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "CY",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          cyprusRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: cyprusReview,
    })),
  );
