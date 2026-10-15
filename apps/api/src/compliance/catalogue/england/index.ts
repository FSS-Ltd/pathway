import { TRACKER_TOPICS, type TrackerTopic } from "@pathway/types";
import type { TrackerCatalogue } from "../schema";
import { englandReview, englandSectors } from "./shared";
import { educationSources } from "./education-sources";
import { registrationRequirements } from "./registration";
import { educationRequirements } from "./education";
import { safeguardingSources, safeguardingRequirements } from "./safeguarding";
import { personnelSources, personnelRequirements } from "./personnel";
import { privacySources, privacyRequirements } from "./privacy";
import { operationsSources, operationsRequirements } from "./operations";
import {
  medicalSafetySources,
  medicalSafetyRequirements,
} from "./medical-safety";
import { icceSources, icceRequirements } from "./icce";
export const englandSources: TrackerCatalogue["sources"] = [
  ...educationSources,
  ...safeguardingSources,
  ...personnelSources,
  ...privacySources,
  ...operationsSources,
  ...medicalSafetySources,
  ...icceSources,
];
export const englandRequirements: TrackerCatalogue["requirements"] = [
  ...registrationRequirements,
  ...educationRequirements,
  ...safeguardingRequirements,
  ...personnelRequirements,
  ...privacyRequirements,
  ...operationsRequirements,
  ...medicalSafetyRequirements,
  ...icceRequirements,
];
const gaps: Record<TrackerTopic, string> = {
  registration_governance:
    "Reviewed classification and independent-school/EYFS core. Detailed maintained-school/academy admissions, complaints and publication routes, childcare register conditions and local planning/licensing permissions remain incomplete.",
  safeguarding:
    "Reviewed school, early-years and community core. Actual local safeguarding-partner/LADO/referral arrangements, relevant-agency designation and denominational/sport/funder conditions require site-specific review; specialist adult services are not covered.",
  personnel:
    "Reviewed school/EYFS core and individual role-check assessment. Actual regulated-activity eligibility, specialist qualifications, disqualification/exemptions, adult regulated services and local/provider terms remain site-specific.",
  privacy_records:
    "Reviewed controller/privacy core and conditional assessment actions. Detailed biometrics, online children's services, PECR, international transfers, exceptional rights routes and processor/joint-controller arrangements remain incomplete.",
  premises_safety:
    "Reviewed employer, school medical/accessibility and premises responsibility core. Fire allocation and local permissions need evidence; asbestos, legionella, plant, construction and specialist safety regimes are not comprehensively covered.",
  education_childcare:
    "Reviewed independent-school, attendance and group/school EYFS core. Detailed maintained/academy curriculum/admissions/SEND, section 41, funded early years, childcare register and special/residential provision require further review.",
  activities:
    "Reviewed food-business core and activity assessment actions. Actual transport/driver/vehicle and boarding regimes, adventure-activity licensing, residential special schools, private fostering and local permissions remain incomplete.",
  ace_icce:
    "Reviewed public ICCE participant requirements. Current institutional ACE-only agreements, entity-specific status and regional provider terms must be obtained and reviewed; portal evidence never grants external approval.",
};
export const englandCoverage: TrackerCatalogue["coverage"] =
  englandSectors.flatMap((sector) =>
    TRACKER_TOPICS.map((topic) => ({
      jurisdiction: "GB-ENG",
      sector,
      topic,
      status: "PARTIALLY_PUBLISHED",
      regionalStatus: "IN_REVIEW",
      regions: [],
      requiresRegion: true,
      reason: gaps[topic],
      sourceIds: [
        ...new Set(
          englandRequirements
            .filter((requirement) => requirement.topic === topic)
            .flatMap((requirement) => requirement.sourceIds),
        ),
      ],
      review: englandReview,
    })),
  );
