import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { finlandReview, finlandSectors } from "./shared";
import { finlandRequirements } from "./requirements";

export { finlandRequirements } from "./requirements";
export { finlandSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Mainland basic-education and 2026 private ECEC routes reviewed. Åland legislation, municipal interpretation, transitions and other provider routes remain incomplete.",
  safeguarding:
    "Education-personnel reporting guidance reviewed. Åland, municipal referral procedures, emergency response and service-specific safeguarding remain incomplete.",
  personnel:
    "Child-work extract route reviewed. Role and duration tests, volunteers, qualifications, training and local review practice remain incomplete.",
  privacy_records:
    "GDPR and education privacy core reviewed. National records, Åland, breach, DPIA and DPO decisions need site-specific review.",
  premises_safety:
    "Employer hazard assessment reviewed. Fire, building, health, accessibility, Åland and municipal rules remain incomplete.",
  education_childcare:
    "Mainland basic education and current ECEC grounds reviewed. Åland, local curricula, staffing ratios, inclusion and admissions remain incomplete.",
  activities:
    "Food-business notification and hygiene core reviewed. Occasional-event and higher-risk routes, trips, transport and boarding remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Finnish recognition and entity-specific provider approval require external evidence.",
};

export const finlandCoverage: TrackerCatalogue["coverage"] =
  finlandSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "FI",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          finlandRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: finlandReview,
    })),
  );
