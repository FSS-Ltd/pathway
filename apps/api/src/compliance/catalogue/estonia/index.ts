import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { estoniaReview, estoniaSectors } from "./shared";
import { estoniaRequirements } from "./requirements";

export { estoniaRequirements } from "./requirements";
export { estoniaSources } from "./sources";

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Private-school, hobby-school and early-childhood routes identified. Other providers, 79 municipal criteria and transitional licence decisions remain incomplete.",
  safeguarding:
    "Child Protection Act reporting route reviewed. Municipal procedures, emergency response and provider-specific safeguards remain incomplete.",
  personnel:
    "Child-work restriction check identified. Actual role scope, qualification, training, cross-border checks and review practice need authority validation.",
  privacy_records:
    "Core GDPR and school processing/retention guidance reviewed. Estonian specialist records, breach, DPIA and DPO decisions remain incomplete.",
  premises_safety:
    "Employer risk assessment and early-childhood environment identified. Building, fire, hygiene, accessibility and municipal rules remain incomplete.",
  education_childcare:
    "Private general-school and 2025 early-childhood framework identified. Institution-specific staffing, inclusion and local admission rules remain incomplete.",
  activities:
    "Catering notification or licence and EU hygiene core identified. Trip, transport, boarding and specialist food routes remain incomplete.",
  ace_icce:
    "Public ICCE terms reviewed for actual participants. Estonian legal recognition and entity-specific provider approval require external evidence.",
};

export const estoniaCoverage: TrackerCatalogue["coverage"] =
  estoniaSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "EE",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          estoniaRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: estoniaReview,
    })),
  );
