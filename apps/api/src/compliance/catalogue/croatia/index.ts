import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { croatiaReview, croatiaSectors } from "./shared";
import { croatiaRequirements } from "./requirements";

export { croatiaRequirements } from "./requirements";
export { croatiaSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Private-school establishment route reviewed. Other provider categories, approval changes, inspections and county-specific permissions remain incomplete.",
  safeguarding:
    "Police reporting route and published protocol reviewed. Institution-specific reporting duties, county contacts and training remain incomplete.",
  personnel:
    "Certificate types distinguished. Role-specific legal checks, qualifications, health checks and training need education-authority validation.",
  privacy_records:
    "Core EU GDPR controller duties reviewed. Croatian detail on DPO, DPIA, breaches, data rights and specialist records remains incomplete.",
  premises_safety:
    "Employer risk and first-aid duties reviewed. Building, fire, accessibility and health permissions need county and municipal review.",
  education_childcare:
    "School, kindergarten and shorter preschool approval routes identified. Programme detail, ratios, inclusion, inspections and county care rules remain incomplete.",
  activities:
    "Food-business registration and EU hygiene core reviewed. Trips, transport, boarding, youth activities and specialist food approvals remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Croatian school recognition and entity-specific ICCE approval require external evidence.",
};

export const croatiaCoverage: TrackerCatalogue["coverage"] =
  croatiaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "HR",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          croatiaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: croatiaReview,
    })),
  );
