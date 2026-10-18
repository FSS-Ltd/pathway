import type { CatalogueRequirement } from "../schema";
import { irelandRequirement as action } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;

export const operationsRequirements: CatalogueRequirement[] = [
  action({
    id: "irl.privacy-role",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Document controller, joint-controller and processor roles for the site's personal-data activities.",
    applicabilityExplanation:
      "EU GDPR roles follow who determines purposes and means, not school funding, charitable status or selected product screens.",
    unknownExplanation:
      "Map actual data flows and contracts before excluding controller duties.",
    expectedEvidence: [
      "Processing map and controller decisions without case-level personal data",
    ],
    sourceIds: ["irl-school-privacy", "irl-gdpr-principles"],
    signalKeys: [],
  }),
  action({
    id: "irl.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Record a lawful basis for each processing purpose and review data minimisation, accuracy and retention.",
    applicabilityExplanation:
      "EU GDPR Articles 5 and 6 apply to controllers in Ireland, including schools and childcare providers.",
    unknownExplanation:
      "Confirm controller role, purposes and the applicable legal basis for each.",
    expectedEvidence: [
      "Lawful-basis register, retention schedule and review record",
    ],
    sourceIds: ["irl-gdpr-principles", "irl-gdpr-basis"],
    signalKeys: [],
  }),
  action({
    id: "irl.privacy-information",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Provide clear privacy information for direct and indirect collection, including child-appropriate explanations.",
    applicabilityExplanation:
      "EU GDPR Articles 13 and 14 have different timing and content; the Irish Data Protection Commission stresses extra protection for children.",
    unknownExplanation:
      "Confirm the collection route, audience and any applicable Article 14 exception.",
    expectedEvidence: ["Versioned notices and delivery or exception evidence"],
    sourceIds: ["irl-gdpr-notice", "irl-gdpr-indirect", "irl-school-privacy"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "irl.privacy-sensitive",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Assess special-category conditions and risk-based security for health, religion and safeguarding records.",
    applicabilityExplanation:
      "EU GDPR Articles 9 and 32 apply to actual sensitive processing and security, with Irish-law conditions where relevant.",
    unknownExplanation:
      "Confirm sensitive categories and the corresponding legal condition and safeguards.",
    expectedEvidence: [
      "Condition assessment, access/retention controls and security review",
    ],
    sourceIds: ["irl-gdpr-sensitive", "irl-gdpr-security"],
    signalKeys: ["medical", "safeguarding"],
  }),
  action({
    id: "irl.employer-safety",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess workplace risks and maintain a written safety statement with implemented controls.",
    applicabilityExplanation:
      "Sections 19 and 20 of the Safety, Health and Welfare at Work Act 2005 apply to employers and relevant workplace risks.",
    unknownExplanation:
      "Confirm employer status, activities, workers and shared-premises responsibilities.",
    expectedEvidence: [
      "Risk assessments, safety statement, staff access and review history",
    ],
    sourceIds: ["irl-risk"],
    signalKeys: [],
  }),
  action({
    id: "irl.firstaid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Provide workplace first-aid arrangements based on assessed staffing and risks.",
    applicabilityExplanation:
      "The HSA guide explains the 2007 general application regulations; children's care may require additional arrangements.",
    unknownExplanation:
      "Confirm staffing, workplace risks and first-aid needs.",
    expectedEvidence: [
      "First-aid needs assessment, supplies and trained-person review",
    ],
    sourceIds: ["irl-firstaid"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "irl.fire",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: premises,
    action:
      "Maintain an adequate standard of fire safety for premises controlled by the site.",
    applicabilityExplanation:
      "Fire Services Acts 1981 and 2003 section 18 place duties on persons controlling relevant premises; local fire-authority requirements may add detail.",
    unknownExplanation:
      "Identify the person controlling premises and any shared-control or fire-authority conditions.",
    expectedEvidence: [
      "Fire risk assessment, precautions, drills and shared-duty agreement",
    ],
    sourceIds: ["irl-fire"],
    signalKeys: [],
  }),
];
