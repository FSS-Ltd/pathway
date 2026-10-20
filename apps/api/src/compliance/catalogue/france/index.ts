import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { franceReview, franceSectors } from "./shared";
import { franceRequirements } from "./requirements";

export { franceRequirements } from "./requirements";
export { franceSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Private-school national and Alsace-Moselle routes, ACM and EAJE entry points reviewed. Contract schools, other provision, local decisions and overseas adaptations remain incomplete.",
  safeguarding:
    "Child-danger reporting route reviewed. Service-specific procedures and departmental protection contacts remain incomplete.",
  personnel:
    "ACM role and honourability guidance reviewed. School and childcare qualifications, checks, ratios and regional interpretation remain incomplete.",
  privacy_records:
    "GDPR and CNIL education core reviewed. Sector-specific retention, breaches, DPIA and DPO decisions need site-specific review.",
  premises_safety:
    "Employer DUERP and ERP fire/accessibility entry points reviewed. Building category, local authorisations and specialist premises duties remain incomplete.",
  education_childcare:
    "Hors-contrat common core and EAJE authorisation conditions reviewed. Public/contract school, curriculum, inclusion, local staffing and overseas adaptations remain incomplete.",
  activities:
    "Food hygiene and ACM trip classification reviewed. Transport, boarding, specialist catering and local permission routes remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. French legal recognition and entity-specific approval require external evidence.",
};

export const franceCoverage: TrackerCatalogue["coverage"] =
  franceSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "FR",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          franceRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: franceReview,
    })),
  );
