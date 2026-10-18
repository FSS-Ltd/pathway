import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { northernIrelandReview, northernIrelandSectors } from "./shared";
import { coreRequirements } from "./core";
import { operationsRequirements } from "./operations";
import { provisionRequirements } from "./provision";

export { northernIrelandSources } from "./sources";
export const northernIrelandRequirements: TrackerCatalogue["requirements"] = [
  ...coreRequirements,
  ...operationsRequirements,
  ...provisionRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Independent-school and HSC Trust childcare routes reviewed. Actual classification, local permissions, charity and specialist registrations remain site-specific.",
  safeguarding:
    "National school and cross-sector safeguarding guidance reviewed. HSC Trust referrals, SBNI procedures, allegations and specialist duties remain in review.",
  personnel:
    "AccessNI regulated-activity changes and school recruitment circular reviewed. Individual eligibility, exceptions and service-specific workforce rules require case review.",
  privacy_records:
    "Core UK controller duties reviewed. Data rights, DPIA/DPO, transfers, actual roles and specialist records remain incomplete.",
  premises_safety:
    "HSENI risk and first aid plus Northern Ireland fire routes reviewed. Building control, shared premises, medical and local requirements remain site-specific.",
  education_childcare:
    "Current attendance, SEN, state curriculum and HSC Trust care standards reviewed. Independent curricula, ratios, specialist provision and contracts remain incomplete.",
  activities:
    "Food, trips and own-vehicle assessment reviewed. District-council controls, transport licensing and residential activities need local or specialist review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Entity-specific approval, ACE agreements and local permissions need external evidence.",
};

export const northernIrelandCoverage: TrackerCatalogue["coverage"] =
  northernIrelandSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "GB-NIR",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          northernIrelandRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: northernIrelandReview,
    })),
  );
