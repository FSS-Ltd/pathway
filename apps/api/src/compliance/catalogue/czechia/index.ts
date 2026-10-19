import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { czechiaReview, czechiaSectors } from "./shared";
import { czechiaRequirements } from "./requirements";

export { czechiaRequirements } from "./requirements";
export { czechiaSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "School and children's-group registers identified. Founder-specific routes, amendments and all regional application details remain incomplete.",
  safeguarding:
    "Ministry school prevention and referral guidance reviewed. Statutory reporting, care-provider rules and local contacts remain incomplete.",
  personnel:
    "Pedagogical qualifications and children's-group carer routes identified. Role-specific suitability, training and renewal need authority validation.",
  privacy_records:
    "Core GDPR controller duties reviewed. Czech breach, DPO, DPIA, pupil and health-record implementation remains incomplete.",
  premises_safety:
    "Employer safety duties and provider premises routes identified. Fire, hygiene, accessibility and municipal approvals require local review.",
  education_childcare:
    "School programme and children's-group routes identified. Age-specific curriculum, capacity, ratios, attendance and inclusion require further review.",
  activities:
    "Food-business notification and EU hygiene core reviewed. Trips, transport, boarding, catering and specialist approvals remain incomplete.",
  ace_icce:
    "Public ICCE terms reviewed for actual participants. Czech school recognition and entity-specific provider approval need external evidence.",
};

export const czechiaCoverage: TrackerCatalogue["coverage"] =
  czechiaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "CZ",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          czechiaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: czechiaReview,
    })),
  );
