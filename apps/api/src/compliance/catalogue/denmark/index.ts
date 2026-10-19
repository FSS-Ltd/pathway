import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { denmarkReview, denmarkSectors } from "./shared";
import { denmarkRequirements } from "./requirements";

export { denmarkRequirements } from "./requirements";
export { denmarkSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Free-primary subsidy and municipal daycare routes identified. Unsubsidised and other school types, 98 municipal criteria and future boundary changes remain incomplete.",
  safeguarding:
    "Children's Act notification duties reviewed. Role-specific professional thresholds, municipal contacts and provider procedures remain incomplete.",
  personnel:
    "Under-15 child-certificate route identified. Sector mandates, role-specific qualifications, training and review practices need authority validation.",
  privacy_records:
    "Core GDPR duties and Danish school/daycare guidance reviewed. National breach, DPO, DPIA and specialist pupil records remain incomplete.",
  premises_safety:
    "Employer APV and municipal daycare approval identified. Building, fire, accessibility, hygiene and municipal rules remain incomplete.",
  education_childcare:
    "Free-primary quality and private daycare categories identified. Public-school, care curriculum, staffing and inclusion detail remain incomplete.",
  activities:
    "Food registration, de minimis review and EU hygiene core identified. Trips, transport, boarding and specialist catering approvals remain incomplete.",
  ace_icce:
    "Public ICCE terms reviewed for actual participants. Danish school recognition and entity-specific provider approval need external evidence.",
};

export const denmarkCoverage: TrackerCatalogue["coverage"] =
  denmarkSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "DK",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          denmarkRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: denmarkReview,
    })),
  );
