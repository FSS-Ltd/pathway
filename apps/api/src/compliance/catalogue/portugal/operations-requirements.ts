import type { CatalogueRequirement } from "../schema";
import { children, portugalRequirement as action } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const food: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "foodBusiness", op: "eq", value: true },
    { field: "food", op: "eq", value: true },
  ],
};
const transport: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "transport", op: "eq", value: true },
    { field: "operatesVehicles", op: "eq", value: true },
  ],
};

export const portugalOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "pt.operator-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the legal operator, responsible people, complaints process and separate school, social-response or activity permissions.",
    applicabilityExplanation:
      "A Charity or Church screen does not establish an IPSS, association, cooperative or approved education status.",
    unknownExplanation:
      "Confirm legal form, governing representatives, site operator, contracts and competent regulators.",
    expectedEvidence: [
      "Operator record, governing documents, internal rules and complaints procedure",
    ],
    sourceIds: ["pt-social-establishments"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "pt.local-authority-interface",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the CAOP municipality and mainland district or autonomous region, then confirm the authority decisions required at the operating address.",
    applicabilityExplanation:
      "CAOP supplies an official location, not a school authorisation, building-use decision or activity licence.",
    unknownExplanation:
      "Confirm the exact municipality, region, address and competent education, social, building and health authorities.",
    expectedEvidence: [
      "Site location and authority correspondence or decisions",
    ],
    sourceIds: ["pt-caop", "pt-municipalities"],
    signalKeys: [],
  }),
  action({
    id: "pt.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data and identify the controller and processors for each system.",
    applicabilityExplanation:
      "Portal records evidence processing but do not decide lawful basis, controller responsibility or retention.",
    unknownExplanation:
      "Confirm purposes, data categories, recipients, storage, retention and transfers.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["pt-gdpr", "pt-data-law"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "pt.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, privacy information, retention, rights handling, processors, access control and breach response.",
    applicabilityExplanation:
      "GDPR and Portuguese implementation duties follow actual controller processing; sensitive records need restricted access.",
    unknownExplanation:
      "Confirm controller role, special-category data, lawful bases and relevant CNPD directions.",
    expectedEvidence: [
      "Processing register, notices, retention and rights procedures, processor terms and breach register",
    ],
    sourceIds: ["pt-gdpr", "pt-data-law"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "pt.dpia-dpo",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing needs a DPIA and whether this operator must appoint and notify a data-protection officer.",
    applicabilityExplanation:
      "DPIA and DPO triggers are conditional; neither is automatic solely because a school uses the portal.",
    unknownExplanation:
      "Confirm public-body status, scale, systematic monitoring, sensitive child-data use and CNPD guidance.",
    expectedEvidence: [
      "DPIA screening, assessment where triggered and documented DPO decision",
    ],
    sourceIds: ["pt-gdpr", "pt-data-law", "pt-cnpd-dpo"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and verify uncertain high-risk processing or DPO scope with CNPD.",
  }),
  action({
    id: "pt.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess and document occupational risks, arrange prevention and health-and-safety services, and inform staff about relevant hazards.",
    applicabilityExplanation:
      "The employer duty depends on actual employment and work, including off-site duties.",
    unknownExplanation:
      "Confirm employer status, worker roles, work locations and risk categories.",
    expectedEvidence: [
      "Risk assessment, prevention plan, staff information and service arrangements",
    ],
    sourceIds: ["pt-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "pt.fire-and-premises",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: premises,
    action:
      "Confirm the site's lawful building use, fire-safety classification, self-protection measures, evacuation and first-aid arrangements.",
    applicabilityExplanation:
      "Fire and building controls depend on actual occupancy, risk class and premises responsibility; a sector choice does not establish approval.",
    unknownExplanation:
      "Confirm owner/operator responsibilities, use class, occupancy and municipal or civil-protection decisions.",
    expectedEvidence: [
      "Building-use record, fire measures, evacuation plan and applicable inspection decisions",
    ],
    sourceIds: ["pt-fire", "pt-social-establishments"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the operator has no relevant premises responsibility and verify uncertain building use with the municipality or civil-protection authority.",
  }),
  action({
    id: "pt.child-medical-arrangements",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Keep restricted emergency contacts, allergy and medical response plans, first-aid capability and staff instructions suited to actual children and activities.",
    applicabilityExplanation:
      "Practical care arrangements depend on actual provision; health details remain sensitive records.",
    unknownExplanation:
      "Confirm ages, known needs, family information, staff capability and emergency procedures.",
    expectedEvidence: [
      "Restricted care plans, emergency procedure and staff briefing",
    ],
    sourceIds: ["pt-creche-standards", "pt-gdpr"],
    signalKeys: ["medical", "personnel"],
  }),
  action({
    id: "pt.food-hygiene",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, establish the applicable registration/notification and hygiene controls, including HACCP-based procedures.",
    applicabilityExplanation:
      "Preparation, catering, distribution and operator responsibility determine the route; a school or club label is not an exemption.",
    unknownExplanation:
      "Confirm kitchen or caterer, handling, scale, site, food authority and contractor responsibilities.",
    expectedEvidence: [
      "Food-business notification or decision, hygiene plan and inspection records",
    ],
    sourceIds: ["pt-food-hygiene", "pt-asae-haccp"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe why no food-business activity is operated and confirm doubtful handling with ASAE or the competent local food authority.",
  }),
  action({
    id: "pt.child-transport",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [transport, { field: "minimumAge", op: "lte", value: 16 }],
    },
    action:
      "For covered collective transport of children, classify principal or accessory operation and verify applicable operator, driver, vehicle and supervision requirements under the current law.",
    applicabilityExplanation:
      "The regime covers transport to schools, care, sport, cultural activities and trips for children up to 16; hired, own and certain accessory transport have different requirements.",
    unknownExplanation:
      "Confirm child ages, vehicle, payment, route, operator and contractor licences.",
    expectedEvidence: [
      "Transport classification, operator or contractor authorisation, driver and vehicle checks",
    ],
    sourceIds: ["pt-child-transport", "pt-transport-license"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain who actually transports children and verify uncertain scope with the transport authority before dismissing this check.",
  }),
  action({
    id: "pt.trips",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan supervision, risk controls, emergency contacts, family information and any child-transport duties for actual trips.",
    applicabilityExplanation:
      "Trip permissions remain separate from portal user agreements; transport and activity duties depend on the actual organiser and destination.",
    unknownExplanation:
      "Confirm children, destination, organiser, vehicles and staff supervision.",
    expectedEvidence: [
      "Trip assessment, supervision plan, family permission and transport checks",
    ],
    sourceIds: ["pt-child-transport", "pt-child-protection"],
    signalKeys: ["trips"],
  }),
];
