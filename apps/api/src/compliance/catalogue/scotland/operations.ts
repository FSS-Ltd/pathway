import type { CatalogueRequirement } from "../schema";
import { scotlandRequirement as action } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
  ],
};

export const operationsRequirements: CatalogueRequirement[] = [
  action({
    id: "sct.privacy-role",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Document controller, joint-controller and processor roles for the site's personal-data activities.",
    applicabilityExplanation:
      "Each institutional sector processes data, but the legal role follows who determines purposes and means, not the chosen screen set.",
    unknownExplanation:
      "Map actual activities and agreements before excluding controller duties.",
    expectedEvidence: [
      "Processing map, responsibility decisions and privacy contact without identifiable case data",
    ],
    sourceIds: ["sct-privacy-principles", "sct-privacy-basis"],
    signalKeys: [],
  }),
  action({
    id: "sct.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Set a lawful basis for each purpose and review data minimisation, accuracy, retention and accountability.",
    applicabilityExplanation:
      "UK GDPR Articles 5 and 6 apply to controllers in Scotland; public funding and charitable or ACE status do not by themselves establish the basis.",
    unknownExplanation:
      "Confirm controller role and the actual legal basis for each processing purpose.",
    expectedEvidence: [
      "Purpose and lawful-basis register, retention schedule and recorded review",
    ],
    sourceIds: ["sct-privacy-principles", "sct-privacy-basis"],
    signalKeys: [],
  }),
  action({
    id: "sct.privacy-information",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Give clear privacy information, including child-appropriate explanations where needed.",
    applicabilityExplanation:
      "UK GDPR Articles 13–14 require information; timing and content differ between direct and indirect collection.",
    unknownExplanation:
      "Confirm controller role, collection routes and whether children receive the information.",
    expectedEvidence: [
      "Versioned notices, delivery method and records of indirect-collection timing or exceptions",
    ],
    sourceIds: ["sct-privacy-notice", "sct-privacy-indirect"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "sct.privacy-sensitive-security",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Assess special-category conditions and protect health and safeguarding data with breach-response procedures.",
    applicabilityExplanation:
      "Health and safeguarding data can need Article 9 and Data Protection Act conditions as well as Article 32 security; notification duties depend on assessed breach risk.",
    unknownExplanation:
      "Confirm controller role, actual sensitive-data categories and whether any breach triggers notification.",
    expectedEvidence: [
      "Special-category condition record, access/retention controls and breach assessment log",
    ],
    sourceIds: [
      "sct-privacy-sensitive",
      "sct-privacy-security",
      "sct-privacy-breach",
    ],
    signalKeys: ["medical", "safeguarding"],
  }),
  action({
    id: "sct.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess and control health and safety risks to staff and people affected by the undertaking.",
    applicabilityExplanation:
      "Employer duties apply through actual employment and activities, even where premises are shared.",
    unknownExplanation:
      "Confirm employer status and the risks created by the site's activities.",
    expectedEvidence: [
      "Current risk assessments, control owners and review or incident records",
    ],
    sourceIds: ["sct-risk"],
    signalKeys: [],
  }),
  action({
    id: "sct.firstaid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Provide adequate and appropriate workplace first-aid arrangements for employees.",
    applicabilityExplanation:
      "The employer's assessment determines equipment, facilities and trained personnel; children's care needs may require additional arrangements.",
    unknownExplanation:
      "Confirm employer status, staffing pattern and workplace risks.",
    expectedEvidence: [
      "First-aid needs assessment, named provision, supplies and training review",
    ],
    sourceIds: ["sct-firstaid"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "sct.fire",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: premises,
    action:
      "Assess fire risk and maintain precautions under Scottish non-domestic fire-safety law.",
    applicabilityExplanation:
      "Part 3 of the Fire (Scotland) Act 2005 and the 2006 Regulations apply to dutyholders; shared-premises responsibilities must be allocated.",
    unknownExplanation:
      "Confirm control of the non-domestic premises and the responsible dutyholder arrangement.",
    expectedEvidence: [
      "Fire risk assessment, escape and drill records, maintenance and shared-control agreement",
    ],
    sourceIds: ["sct-fire"],
    signalKeys: [],
  }),
  action({
    id: "sct.school-accessibility",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Maintain the applicable school accessibility strategy for disabled pupils.",
    applicabilityExplanation:
      "The 2002 Scottish Act places planning duties on education authorities and independent or grant-aided school responsible bodies; responsibilities differ by provider.",
    unknownExplanation:
      "Confirm actual school status and identify the education authority or proprietor responsible for the strategy.",
    expectedEvidence: [
      "Accessibility strategy, curriculum and physical-access actions, publication and review evidence",
    ],
    sourceIds: ["sct-accessibility"],
    signalKeys: [],
  }),
];
