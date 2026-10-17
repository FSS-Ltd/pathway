import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { walesReview, walesSectors } from "./shared";
import { educationSources } from "./education-sources";
import { registrationRequirements } from "./registration";
import { educationRequirements } from "./education";
import { safeguardingRequirements } from "./safeguarding";
import { personnelRequirements } from "./personnel";
import { privacySources } from "./privacy-sources";
import { privacyRequirements } from "./privacy";
import { operationsSources } from "./operations-sources";
import { premisesRequirements } from "./premises";
import { activitiesRequirements } from "./activities";
import { icceSources, icceRequirements } from "./icce";

export const walesSources: TrackerCatalogue["sources"] = [
  ...educationSources,
  ...privacySources,
  ...operationsSources,
  ...icceSources,
];
export const walesRequirements: TrackerCatalogue["requirements"] = [
  ...registrationRequirements,
  ...educationRequirements,
  ...safeguardingRequirements,
  ...personnelRequirements,
  ...privacyRequirements,
  ...premisesRequirements,
  ...activitiesRequirements,
  ...icceRequirements,
];
const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Reviewed independent-school classification, registration and returns. Maintained, nursery, community, charitable and local authority permissions remain route- and site-specific; specialist registrations are unreviewed.",
  safeguarding:
    "Reviewed Welsh school guidance and community safeguarding assessment. Local authority and regional safeguarding-board procedures, specialist settings and actual referrals need site-specific review.",
  personnel:
    "Reviewed role-based checks, independent-school recheck and EWC routes. Individual eligibility, barred-list access, exceptions, regulated activity and specialist qualifications require case review.",
  privacy_records:
    "Reviewed UK controller duties and assessment routes for Welsh institutions. Actual processing roles, exemptions, children’s online services, transfers and specialist records remain site-specific.",
  premises_safety:
    "Reviewed employer risk and first aid, school accessibility and assessment of fire, medical and premises responsibility. Shared control, local permissions and specialist premises regimes need further review.",
  education_childcare:
    "Reviewed independent-school standards, maintained curriculum, funded nursery and childcare registration assessments. Actual childcare exemptions, age phases, ALN and specialist provision need further review.",
  activities:
    "Reviewed food-business core and assessment of ratings, transport, trips, adventure and boarding. Actual licences, vehicles, residential-service categories and local conditions need further review.",
  ace_icce:
    "Reviewed public ICCE provider requirements only for participating institutions. Actual ACE institutional agreements, entity status, regional terms and external approvals need direct evidence.",
};
export const walesCoverage: TrackerCatalogue["coverage"] = walesSectors.flatMap(
  (sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "GB-WLS",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED" as const,
      regionalStatus: "IN_REVIEW" as const,
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          walesRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: walesReview,
    })),
);
