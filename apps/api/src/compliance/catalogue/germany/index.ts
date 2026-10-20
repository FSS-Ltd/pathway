import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { germanyReview, germanySectors } from "./shared";
import { germanyRequirements } from "./requirements";

export { germanyRequirements } from "./requirements";
export { germanySources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Federal youth-establishment route and Länder school-law entry point reviewed. Land-by-Land school decisions, local permits and youth-welfare exceptions remain in review.",
  safeguarding:
    "Federal youth-welfare protection routes reviewed. Each Land's school protection requirements and local Jugendamt procedures remain in review.",
  personnel:
    "Federal role-based certificate and community-health entry points reviewed. Land qualifications, school checks and local implementation remain in review.",
  privacy_records:
    "GDPR and federal employment-data core reviewed. Land public-sector rules, retention, DPO and DPIA decisions remain site-specific.",
  premises_safety:
    "Federal employer risk and community-facility hygiene entry points reviewed. Land building, fire, accessibility and local health requirements remain in review.",
  education_childcare:
    "Länder school-law and federal daycare-quality entry points reviewed. All sixteen Länder curricula, ratios, inclusion and inspection conditions remain in review.",
  activities:
    "Food-hygiene and trip/camp classification entry points reviewed. Transport, boarding, Land and local food/health permissions remain in review.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. Land recognition and entity-specific permission require external evidence.",
};

export const germanyCoverage: TrackerCatalogue["coverage"] =
  germanySectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "DE",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          germanyRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: germanyReview,
    })),
  );
