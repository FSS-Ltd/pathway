import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { greeceReview, greeceSectors } from "./shared";
import { greeceInstitutionRequirements } from "./institution-requirements";
import { greeceOperationalRequirements } from "./operations-requirements";

export { greeceSources } from "./sources";
export const greeceRequirements = [
  ...greeceInstitutionRequirements,
  ...greeceOperationalRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "National school, tuition, preschool and KDAP routes reviewed. Region, municipality, operator-specific approvals and special Mount Athos arrangements remain in review.",
  safeguarding:
    "Law 4837/2021 entity scope and reporting reviewed. School-specific, regional and local protection procedures remain in review.",
  personnel:
    "Covered-entity role restrictions and tuition-teacher route reviewed. School appointments, qualifications and local verification practice remain in review.",
  privacy_records:
    "GDPR and Greek authority core reviewed. Controller-specific retention, DPIA, DPO and local processing decisions remain in review.",
  premises_safety:
    "Employer risk and licence-premises entry points reviewed. Region and municipal building, fire, accessibility and health decisions remain in review.",
  education_childcare:
    "Private-school and care operating routes reviewed. Curriculum, ratios, inclusion, inspections and regional/municipal conditions remain in review.",
  activities:
    "Food hygiene, school-canteen and camp routes reviewed. Transport, boarding, trip and local food/health permissions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Greek qualification recognition and entity-specific permission need external evidence.",
};

export const greeceCoverage: TrackerCatalogue["coverage"] =
  greeceSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "GR",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          greeceRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: greeceReview,
    })),
  );
