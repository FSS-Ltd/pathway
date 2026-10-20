import type { CatalogueRequirement } from "../schema";
import {
  children,
  formalSchool,
  polandRequirement as action,
  preschool,
  underThreeCare,
} from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const charitable = { field: "charitable", op: "eq", value: true } as const;
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
const trips = { field: "trips", op: "eq", value: true } as const;

export const polandOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "pl.operator-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the legal operator, responsible people, complaints route and separate school, care or activity registrations.",
    applicabilityExplanation:
      "Sector and charitable labels do not establish a Polish legal form, KRS entry or permission to provide education.",
    unknownExplanation:
      "Confirm legal form, governing body, site operator and authority correspondence.",
    expectedEvidence: [
      "Operator record, governing documents and complaints procedure",
    ],
    sourceIds: ["pl-education-law", "pl-under3-law", "pl-krs"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "pl.krs-legal-form",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: charitable,
    action:
      "If the operator is a fundacja or covered stowarzyszenie, verify its actual KRS registration and governing representation.",
    applicabilityExplanation:
      "A Charity or Church screen is not proof of foundation, association or public-benefit legal status.",
    unknownExplanation:
      "Confirm legal form, founders, board and register status; detailed tax/fundraising compliance is outside this pack.",
    expectedEvidence: ["KRS extract, statute and governing-body record"],
    sourceIds: ["pl-krs"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the operator's actual legal form and verify doubtful KRS duties with the register or local authority.",
  }),
  action({
    id: "pl.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data and identify the controller and processors for each system.",
    applicabilityExplanation:
      "Portal records evidence processing, not a lawful basis or a decision on who controls a school or childcare record.",
    unknownExplanation:
      "Confirm purposes, categories, recipients, storage, retention and transfers.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["pl-gdpr", "pl-uodo-school"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "pl.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, privacy information, retention, rights handling, processor agreements, access control and breach response.",
    applicabilityExplanation:
      "GDPR duties follow actual controller processing; health and child-protection records need restricted access.",
    unknownExplanation:
      "Confirm controller role, special-category data, lawful bases and UODO guidance.",
    expectedEvidence: [
      "Processing register, notices, retention and rights procedures, processor agreements and breach register",
    ],
    sourceIds: ["pl-gdpr", "pl-uodo-school"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "pl.dpia-dpo",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing requires a DPIA and whether the organisation meets a DPO appointment trigger.",
    applicabilityExplanation:
      "These are conditional GDPR duties, not universal obligations for every small centre.",
    unknownExplanation:
      "Confirm scale, systematic monitoring, public-body status and sensitive child-data use with UODO.",
    expectedEvidence: [
      "DPIA screening, completed assessment where triggered and DPO decision",
    ],
    sourceIds: ["pl-gdpr", "pl-uodo-school"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the trigger assessment and verify uncertain high-risk processing with UODO or competent local authority.",
  }),
  action({
    id: "pl.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess and document occupational risks for actual work, inform staff and maintain suitable protective measures.",
    applicabilityExplanation:
      "The PIP employer duty depends on employment and actual tasks, including work away from the usual site.",
    unknownExplanation:
      "Confirm employer status, staff roles, workplaces and hazards.",
    expectedEvidence: [
      "Documented risk assessment, staff information and action record",
    ],
    sourceIds: ["pl-pip-risk"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "pl.emergency-arrangements",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Verify fire precautions, evacuation, first aid and building-use arrangements for the actual premises and child groups.",
    applicabilityExplanation:
      "Building, sanitary and fire decisions depend on site use, occupancy and local authorities, not a generic school screen.",
    unknownExplanation:
      "Confirm occupancy, use category, employer status, fire service and sanitary-inspector requirements.",
    expectedEvidence: [
      "Premises risk review, emergency plan, inspection decisions and first-aid arrangements",
    ],
    sourceIds: ["pl-pip-safety", "pl-under3-premises"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site does not control a relevant premises duty and verify uncertain use with the gmina, fire service or sanitary inspector.",
  }),
  action({
    id: "pl.under3-premises",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: underThreeCare,
    action:
      "For regulated under-three care, verify premises capacity, sanitary and fire requirements and the local decisions needed for the register.",
    applicabilityExplanation:
      "Żłobek and children's-club premises rules depend on service type, child count and building arrangements.",
    unknownExplanation:
      "Confirm registered category, rooms, occupancy, fire opinion or decision and sanitary assessment.",
    expectedEvidence: [
      "Capacity plan, sanitary assessment, fire decision and municipal registration materials",
    ],
    sourceIds: ["pl-under3-registration", "pl-under3-premises"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why no regulated under-three premises exist and confirm uncertain space or use rules with the gmina and inspectorates.",
  }),
  action({
    id: "pl.child-medical-arrangements",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Keep appropriate emergency contacts, allergy and medical response plans, first-aid arrangements and restricted access to child health information.",
    applicabilityExplanation:
      "Practical arrangements depend on actual children and activities; health details remain sensitive records.",
    unknownExplanation:
      "Confirm ages, known needs, consent, staff capability and emergency procedures.",
    expectedEvidence: [
      "Restricted care plans, emergency procedure and staff briefing",
    ],
    sourceIds: ["pl-under3-standards", "pl-gdpr", "pl-pip-safety"],
    signalKeys: ["medical", "personnel"],
  }),
  action({
    id: "pl.food-business",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, check the local sanitary inspector's registration or approval route and maintain hygiene/HACCP controls.",
    applicabilityExplanation:
      "Preparation, catering, sale and operator responsibility affect the food-establishment route; the site must not infer an exemption from its sector.",
    unknownExplanation:
      "Confirm kitchen/caterer, site, food handling, scale, local inspector and approval status.",
    expectedEvidence: [
      "Food registration or approval, hygiene plan, supplier agreement and inspection records",
    ],
    sourceIds: ["pl-food-register", "pl-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe why no food-business activity is operated and confirm doubtful handling with the local sanitary inspector.",
  }),
  action({
    id: "pl.school-nutrition-2026",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [{ any: [formalSchool, preschool] }, food] },
    action:
      "For education-system school or preschool food provision, check the food-sale and collective-catering rules effective 1 September 2026.",
    applicabilityExplanation:
      "The 2026 rules are specific to covered education-system units providing or selling food, not every private tuition centre.",
    unknownExplanation:
      "Confirm registered education type, menu or shop, caterer responsibility and current GIS requirements.",
    expectedEvidence: [
      "Menu and procurement review, caterer instructions and sanitary inspection record",
    ],
    sourceIds: ["pl-school-food-2026", "pl-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no covered school or preschool food provision exists and verify an uncertain service with GIS or the local sanitary inspector.",
  }),
  action({
    id: "pl.transport",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: transport,
    action:
      "Classify transport the site provides or contracts and verify the operator's own-account or commercial passenger-transport requirements.",
    applicabilityExplanation:
      "A school minibus, hired bus and parent transport have different operator and vehicle duties.",
    unknownExplanation:
      "Confirm vehicle, payment, route, operator, driver and contractor licences with transport authorities.",
    expectedEvidence: [
      "Transport classification, operator/contractor permits and driver/vehicle checks",
    ],
    sourceIds: ["pl-own-transport", "pl-licensed-transport"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain who actually carries children and confirm uncertain operator status with GITD or the local transport authority.",
  }),
  action({
    id: "pl.school-trips",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan supervision, risk controls, emergency contacts and family information for actual trips; apply school-trip rules where the organiser is a covered school.",
    applicabilityExplanation:
      "School-trip regulation and general club trips are different routes; permissions remain separate from portal user agreements.",
    unknownExplanation:
      "Confirm organiser, school status, destination, age, transport and supervision.",
    expectedEvidence: [
      "Trip assessment, supervision plan, family notice or permission and transport checks",
    ],
    sourceIds: ["pl-school-trips", "pl-child-protection-guides"],
    signalKeys: ["trips"],
  }),
  action({
    id: "pl.organised-holiday",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "If the site organises a qualifying colony, camp, day camp or other child holiday, verify notification to the competent kurator oświaty and staffing/safety conditions.",
    applicabilityExplanation:
      "Holiday registration applies to qualifying organised breaks, not automatically to every ordinary school excursion.",
    unknownExplanation:
      "Confirm dates, duration, organiser, location, overnight status and any statutory school exception.",
    expectedEvidence: [
      "Holiday-register submission, superintendent confirmation, staffing and site checks",
    ],
    sourceIds: ["pl-holiday-2026", "pl-child-protection-guides"],
    signalKeys: ["trips", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the activity is outside organised-holiday rules and verify doubt with the kurator oświaty before skipping registration.",
  }),
];
