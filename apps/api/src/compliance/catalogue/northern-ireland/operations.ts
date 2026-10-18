import type { CatalogueRequirement } from "../schema";
import { northernIrelandRequirement as action } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;

export const operationsRequirements: CatalogueRequirement[] = [
  action({
    id: "nir.privacy-role",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map the site's controller, joint-controller and processor responsibilities for personal data.",
    applicabilityExplanation:
      "The role follows actual decisions about data processing, not sector, ACE branding or public funding.",
    unknownExplanation:
      "Review data flows and contracts before excluding controller duties.",
    expectedEvidence: [
      "Processing map, controller decisions and privacy contact",
    ],
    sourceIds: ["nir-privacy-principles", "nir-privacy-basis"],
    signalKeys: [],
  }),
  action({
    id: "nir.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Record lawful bases by processing purpose and review data minimisation, accuracy and retention.",
    applicabilityExplanation:
      "UK GDPR Articles 5 and 6 apply to Northern Ireland controllers; the lawful basis depends on actual processing and controller role.",
    unknownExplanation:
      "Confirm controller role and each data-processing purpose.",
    expectedEvidence: [
      "Lawful-basis register, retention schedule and review history",
    ],
    sourceIds: ["nir-privacy-principles", "nir-privacy-basis"],
    signalKeys: [],
  }),
  action({
    id: "nir.privacy-information",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Provide clear privacy information for data collected directly or from other sources.",
    applicabilityExplanation:
      "UK GDPR Articles 13 and 14 set different information and timing conditions; children's explanations should be understandable.",
    unknownExplanation:
      "Confirm collection route, controller role and the applicable timing or exception.",
    expectedEvidence: ["Versioned notices and delivery or exception records"],
    sourceIds: ["nir-privacy-information", "nir-privacy-indirect"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "nir.privacy-sensitive",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Record special-category conditions and protect health and safeguarding data with risk-based security.",
    applicabilityExplanation:
      "Processing actual health or safeguarding information may require an Article 9 condition and Article 32 security controls.",
    unknownExplanation:
      "Confirm whether special-category data is processed and which legal condition applies.",
    expectedEvidence: [
      "Condition assessment, access controls, retention and security review",
    ],
    sourceIds: ["nir-privacy-sensitive", "nir-privacy-security"],
    signalKeys: ["medical", "safeguarding"],
  }),
  action({
    id: "nir.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess workplace risks to employees and people affected by the site's activities.",
    applicabilityExplanation:
      "Northern Ireland employer risk duties apply to actual activities; shared premises do not remove the need to agree responsibilities.",
    unknownExplanation:
      "Confirm employer status, activities and any shared-control arrangements.",
    expectedEvidence: ["Risk assessment, controls, owners and review records"],
    sourceIds: ["nir-risk"],
    signalKeys: [],
  }),
  action({
    id: "nir.firstaid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Provide workplace first-aid arrangements appropriate to the assessed needs.",
    applicabilityExplanation:
      "The employer's needs assessment determines equipment, facilities and trained personnel; child-care duties can add requirements.",
    unknownExplanation:
      "Confirm staffing, workplace risk and the needs assessment.",
    expectedEvidence: [
      "First-aid needs assessment, personnel and training review",
    ],
    sourceIds: ["nir-firstaid"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "nir.fire",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: premises,
    action:
      "Assess fire risk and maintain precautions under Northern Ireland fire-safety rules.",
    applicabilityExplanation:
      "The Fire and Rescue Services (NI) Order 2006 and 2010 regulations apply to responsible persons, rather than Scottish or England/Wales fire rules.",
    unknownExplanation:
      "Identify who controls the non-domestic premises and any shared fire-safety duties.",
    expectedEvidence: [
      "Fire risk assessment, escape/drill records and shared-duty agreement",
    ],
    sourceIds: ["nir-fire"],
    signalKeys: [],
  }),
];
