import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { irelandReview, irelandSectors } from "./shared";
import { coreRequirements } from "./core";
import { operationsRequirements } from "./operations";
import { provisionRequirements } from "./provision";

export { irelandSources } from "./sources";
export const irelandRequirements: TrackerCatalogue["requirements"] = [
  ...coreRequirements,
  ...operationsRequirements,
  ...provisionRequirements,
];

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Parent registration for non-recognised schools and Tusla childcare routes reviewed. School recognition, charity, funding and specialist permissions remain site-specific.",
  safeguarding:
    "Children First relevant-service duties and recognised-school transition reviewed. Mandated persons, local Tusla referral, boarding and specialist procedures need case review.",
  personnel:
    "Garda vetting for relevant work reviewed. Individual eligibility, exceptions, professional registration and childcare workforce rules remain incomplete.",
  privacy_records:
    "Core EU GDPR controller duties reviewed. Irish-law conditions, rights requests, DPIA/DPO, transfers and specialist records remain incomplete.",
  premises_safety:
    "HSA risk, safety statement and first aid plus Irish fire control reviewed. Shared premises, building, accessibility and local fire-authority conditions remain site-specific.",
  education_childcare:
    "Recognised primary curriculum and Tusla care routes reviewed. Recognition, school attendance, SEN, age ratios, funding contracts and phased curriculum detail remain incomplete.",
  activities:
    "Food business, HACCP and trip risk reviewed. Specialist food approval, transport, boarding and local activity permissions remain incomplete.",
  ace_icce:
    "Public ICCE provider terms reviewed for actual participants. ACE agreements, entity-specific approvals and local recognition require external evidence.",
};

export const irelandCoverage: TrackerCatalogue["coverage"] =
  irelandSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "IE",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          irelandRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: irelandReview,
    })),
  );
