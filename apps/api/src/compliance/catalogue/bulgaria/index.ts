import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { bulgariaReview, bulgariaSectors } from "./shared";
import { bulgariaRequirements } from "./requirements";

export { bulgariaRequirements } from "./requirements";
export { bulgariaSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Private-school institution register reviewed. Other provider categories, approvals, notifications and municipality-specific permissions remain incomplete.",
  safeguarding:
    "Immediate child-protection reporting route reviewed. Institution policies, regional contacts, investigations and training remain incomplete.",
  personnel:
    "Criminal-record certificate process reviewed. Role-specific legal checks, qualifications, health checks and training need education or health authority validation.",
  privacy_records:
    "Core EU GDPR controller duties reviewed. Bulgarian detail on DPO, DPIA, breaches, data rights and specialist records remains incomplete.",
  premises_safety:
    "National employer risk and emergency duties reviewed. Building, fire, accessibility and health permissions need oblast and municipal review.",
  education_childcare:
    "School register and nursery health routes identified. Recognition, curriculum, attendance, ratios, inclusion, inspections and local care rules remain incomplete.",
  activities:
    "Food Act and EU hygiene core reviewed. Trips, transport, boarding, youth activities and food-specific approvals remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Bulgarian school recognition and entity-specific ICCE approval require external evidence.",
};

export const bulgariaCoverage: TrackerCatalogue["coverage"] =
  bulgariaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "BG",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          bulgariaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: bulgariaReview,
    })),
  );
