import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { romaniaRequirements } from "./requirements";
import { romaniaCountyCodes, romaniaReview, romaniaSectors } from "./shared";
import { romaniaSources } from "./sources";

export { romaniaRequirements, romaniaSources, romaniaCountyCodes };

const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "School and early-childhood routes reviewed; county and municipality authority decisions, charity and extracurricular routes remain in review.",
  safeguarding:
    "Child-protection and school-violence entry points reviewed; local referral arrangements and activity-specific duties remain in review.",
  personnel:
    "Direct-contact behavioural-integrity certificate route reviewed, including the 2026 amendment; role qualifications and local practice remain in review.",
  privacy_records:
    "GDPR and Romanian implementation entry points reviewed; controller-specific lawful bases, retention, DPIA and DPO decisions remain site-specific.",
  premises_safety:
    "Employer-risk, fire and accessibility entry points reviewed; building use, ISU approval and local decisions remain in review.",
  education_childcare:
    "School and early-childhood operating entry points reviewed; programme, staffing and authority-specific decisions remain in review.",
  activities:
    "Food and trip planning entry points reviewed; transport, boarding, camps and local food permissions remain in review.",
  ace_icce:
    "ICCE provider terms reviewed for actual participants; Romanian qualification recognition remains a separate decision.",
};

const countryCoverage: TrackerCatalogue["coverage"] = romaniaSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "RO",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          romaniaRequirements
            .filter(
              (requirement) =>
                requirement.jurisdiction === "RO" &&
                requirement.topic === topic,
            )
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: romaniaReview,
    })),
);

const regionalCoverage: TrackerCatalogue["coverage"] =
  romaniaCountyCodes.flatMap((jurisdiction) =>
    romaniaSectors.flatMap((sector) =>
      TRACKER_TOPICS.map((topic) => {
        const regionalSources = romaniaRequirements
          .filter(
            (requirement) =>
              requirement.jurisdiction === jurisdiction &&
              requirement.topic === topic,
          )
          .flatMap((requirement) => requirement.sourceIds);
        return {
          jurisdiction,
          sector,
          topic,
          status:
            regionalSources.length > 0
              ? ("PARTIALLY_PUBLISHED" as const)
              : ("IN_REVIEW" as const),
          regionalStatus: "IN_REVIEW" as const,
          regions: [],
          requiresRegion: false,
          reason:
            regionalSources.length > 0
              ? "County authority route reviewed; municipality and site-specific decisions remain in review."
              : "County and municipality implementation remains in review; confirm with the competent territorial authority.",
          sourceIds: [...new Set(regionalSources)],
          review: romaniaReview,
        };
      }),
    ),
  );

export const romaniaCoverage = [...countryCoverage, ...regionalCoverage];
