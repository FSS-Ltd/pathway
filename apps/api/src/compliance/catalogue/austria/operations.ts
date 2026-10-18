import type { CatalogueRequirement } from "../schema";
import { austriaRequirement as action } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;

export const operationsRequirements: CatalogueRequirement[] = [
  action({
    id: "aut.privacy-role",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Document who determines the purposes and means of each personal-data processing activity at the site.",
    applicabilityExplanation:
      "EU GDPR controller or processor status follows actual decisions and contracts, not the portal sector or funding label.",
    unknownExplanation:
      "Map education, medical, safeguarding, staff and family data flows before excluding controller duties.",
    expectedEvidence: ["Processing map and controller or processor decisions"],
    sourceIds: ["aut-privacy-regulator", "aut-gdpr"],
    signalKeys: [],
  }),
  action({
    id: "aut.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Record a lawful basis by purpose and review minimisation, accuracy and retention for personal data.",
    applicabilityExplanation:
      "EU GDPR Articles 5 and 6 apply to an Austrian controller; special-category data needs a separate Article 9 condition.",
    unknownExplanation:
      "Confirm the controller role, processing purposes and actual legal bases.",
    expectedEvidence: ["Lawful-basis register, retention schedule and review"],
    sourceIds: ["aut-gdpr", "aut-privacy-regulator"],
    signalKeys: [],
  }),
  action({
    id: "aut.privacy-information-security",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Provide appropriate privacy information and maintain risk-based security, including a condition for any special-category processing.",
    applicabilityExplanation:
      "EU GDPR Articles 9, 13, 14 and 32 depend on collection route, data categories and security risk; Austrian law may add detail.",
    unknownExplanation:
      "Confirm source of data, health or religion records, recipients and safeguards before deciding the applicable information duties.",
    expectedEvidence: [
      "Versioned notices, special-category assessment and access/security review",
    ],
    sourceIds: ["aut-gdpr", "aut-privacy-regulator"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "aut.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess and document workplace hazards and protective measures for staff, reviewing them when conditions change.",
    applicabilityExplanation:
      "ArbeitnehmerInnenschutzgesetz § 4 applies to employers and actual work activities, including risks to especially vulnerable staff.",
    unknownExplanation:
      "Confirm employer status, tasks, workers, shared premises and the responsible employer.",
    expectedEvidence: [
      "Workplace evaluation, protective measures, responsible person and review history",
    ],
    sourceIds: ["aut-work-risk"],
    signalKeys: [],
  }),
  action({
    id: "aut.workplace-firstaid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Provide suitable first-aid materials and enough trained, available first-aiders for staff workplace risks.",
    applicabilityExplanation:
      "ArbeitnehmerInnenschutzgesetz § 26 bases workplace first aid on activity, risk and staff numbers; childcare may require additional Land-specific arrangements.",
    unknownExplanation:
      "Confirm the workforce, workplace use and first-aid needs assessment.",
    expectedEvidence: [
      "First-aid assessment, equipment record and training/availability evidence",
    ],
    sourceIds: ["aut-work-firstaid"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "aut.land-premises-rules",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Confirm the site's Bundesland building, fire, accessibility and use-permission conditions with the competent authority.",
    applicabilityExplanation:
      "Austria has nine building codes; national source review cannot establish the site's permit or fire obligations without its Land and building use.",
    unknownExplanation:
      "Record Bundesland, building type, control arrangements and any change of use.",
    expectedEvidence: [
      "Land code assessment, permits, fire arrangements and shared-premises agreement",
    ],
    sourceIds: ["aut-regional-building"],
    signalKeys: [],
  }),
];
