import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { belgiumReview, belgiumSectors } from "./shared";
import { belgiumRequirements } from "./requirements";

export { belgiumRequirements } from "./requirements";
export { belgiumSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Provider classification guidance reviewed. Community school recognition, business registration, legal status, notifications and local permissions need site-specific review.",
  safeguarding:
    "Responsible Community identified. Its reporting procedures, youth-protection duties and local authority contacts remain in review.",
  personnel:
    "Federal Model 596-2 route reviewed for relevant roles. Community hiring, qualifications, supervision and training rules remain incomplete.",
  privacy_records:
    "Core EU GDPR controller duties reviewed. Belgian-specific DPO, DPIA, data rights, breach and specialist record conditions remain incomplete.",
  premises_safety:
    "Federal employer risk, fire and first-aid duties reviewed. Regional and municipal building, fire, accessibility and use permissions remain in review.",
  education_childcare:
    "Community school and childcare authority routes identified. Recognition, curricula, attendance, ratios and all Community care licences remain incomplete.",
  activities:
    "Food-chain registration and EU hygiene core reviewed. Trips, transport, boarding, youth activities and specialist permissions remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Belgian school recognition and entity-specific ICCE approval require external evidence.",
};

export const belgiumCoverage: TrackerCatalogue["coverage"] =
  belgiumSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "BE",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          belgiumRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: belgiumReview,
    })),
  );
