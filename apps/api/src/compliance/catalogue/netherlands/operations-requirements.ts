import type { CatalogueRequirement } from "../schema";
import {
  childCare,
  children,
  netherlandsRequirement as action,
} from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const transport: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "transport", op: "eq", value: true },
    { field: "operatesVehicles", op: "eq", value: true },
  ],
};

export const netherlandsOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "nl.operator-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the legal operator, responsible people, complaints route and any separate stichting, vereniging, church or company registration.",
    applicabilityExplanation:
      "Charity, Church or School screens do not establish a Dutch legal form, KVK registration or tax recognition.",
    unknownExplanation:
      "Confirm legal form, board, premises operator, Handelsregister entry and claimed recognition.",
    expectedEvidence: [
      "Operator registration, governing documents and responsible-person record",
    ],
    sourceIds: ["nl-stichting", "nl-ubo", "nl-childcare-start"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "nl.stichting-ubo",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "If the actual operator is a stichting or covered vereniging, verify KVK and applicable UBO registration and keep the board record current.",
    applicabilityExplanation:
      "A charitable label is not proof of stichting, ANBI or UBO status; duties follow the actual legal form.",
    unknownExplanation:
      "Confirm operator legal form and UBO treatment with KVK; detailed tax status is outside this pack.",
    expectedEvidence: [
      "KVK extract, constitution, board and UBO decision or registration",
    ],
    sourceIds: ["nl-stichting", "nl-ubo"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "State the operator's actual legal form and confirm doubtful registration duties with KVK or the municipality.",
  }),
  action({
    id: "nl.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding processing and identify the controller and processors for each system.",
    applicabilityExplanation:
      "Portal records are evidence of processing, not a decision on lawful basis, controller role or permitted sharing.",
    unknownExplanation:
      "Confirm purposes, categories, recipients, systems, retention and international transfers.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["nl-gdpr", "nl-ap-controller", "nl-ap-education"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "nl.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, privacy information, retention, rights handling, processor agreements, access control and breach response.",
    applicabilityExplanation:
      "GDPR controller duties follow actual processing; learner health and safeguarding records need particular protection.",
    unknownExplanation:
      "Confirm controller role, special-category data, lawful bases, recipients and AP guidance.",
    expectedEvidence: [
      "Processing register, privacy notices, retention and rights procedures, processor agreements and breach register",
    ],
    sourceIds: [
      "nl-gdpr",
      "nl-ap-controller",
      "nl-ap-education",
      "nl-ap-breach",
    ],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "nl.dpia-dpo",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing requires a DPIA and whether the operator meets the legal DPO triggers.",
    applicabilityExplanation:
      "Neither duty is universal; decisions depend on the actual processing and organisation.",
    unknownExplanation:
      "Confirm scale, systematic monitoring, sensitive data and vulnerable child data with the AP.",
    expectedEvidence: [
      "DPIA screening, completed DPIA where triggered and DPO assessment",
    ],
    sourceIds: ["nl-gdpr", "nl-ap-dpia", "nl-ap-controller"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and verify uncertain high-risk processing with the AP or competent local authority.",
  }),
  action({
    id: "nl.employer-safety",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Maintain the employer's RI&E and action plan, prevention-worker and BHV emergency arrangements for the actual work and site.",
    applicabilityExplanation:
      "Arbowet duties depend on actual employment and work hazards, including the relevant treatment of volunteers and agency staff.",
    unknownExplanation:
      "Confirm employer status, personnel types, workplaces, risks and occupational-health arrangements.",
    expectedEvidence: [
      "RI&E, action plan, prevention role, BHV plan and incident/first-aid records",
    ],
    sourceIds: ["nl-arbo"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "nl.building-use",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check the current Bbl building function, municipal environmental plan, fire precautions and whether a use notice is needed before operating.",
    applicabilityExplanation:
      "The notice trigger differs by primary school, secondary school, childcare, other uses and occupancy; no universal school threshold applies.",
    unknownExplanation:
      "Confirm building use, occupancy, additional functions, municipality and fire authority requirements under the current Bbl.",
    expectedEvidence: [
      "Building-use assessment, municipal decision or notice, fire plan and inspection record",
    ],
    sourceIds: ["nl-bbl-school", "nl-bbl-notice", "nl-childcare-premises"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no notice or site condition applies and verify an uncertain building use with the municipality or fire authority.",
  }),
  action({
    id: "nl.childcare-premises",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For registered daycare or BSO, verify age-appropriate space, play and sleep arrangements, ventilation, fire safety and the health-and-safety policy.",
    applicabilityExplanation:
      "Premises standards follow actual service, child age and building function rather than a generic nursery screen.",
    unknownExplanation:
      "Confirm LRK category, age groups, rooms, occupancy, GGD report and municipal building conditions.",
    expectedEvidence: [
      "Premises assessment, health-and-safety policy, GGD report and municipal correspondence",
    ],
    sourceIds: [
      "nl-childcare-premises",
      "nl-childcare-quality",
      "nl-bbl-notice",
    ],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the site is outside registered daycare/BSO and confirm uncertain premises duties with the GGD or municipality.",
  }),
  action({
    id: "nl.child-medical-arrangements",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Keep appropriate emergency contacts, allergy and medical response plans, first-aid arrangements and restricted access to child health information.",
    applicabilityExplanation:
      "Practical arrangements depend on actual children and activities; medical records are sensitive data.",
    unknownExplanation:
      "Confirm ages, care and activities, known needs, consent, staff capability and emergency procedures.",
    expectedEvidence: [
      "Restricted care plans, emergency procedure and staff briefing",
    ],
    sourceIds: ["nl-childcare-quality", "nl-arbo", "nl-gdpr"],
    signalKeys: ["medical", "personnel"],
  }),
  action({
    id: "nl.food-business",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, check each site's NVWA registration or documented exception and maintain HACCP-based hygiene controls.",
    applicabilityExplanation:
      "NVWA lists a DUO-registered school and occasional non-business sales among registration exceptions; neither exception automatically removes food-safety duties.",
    unknownExplanation:
      "Confirm operator, frequency, food preparation, DUO registration and NVWA classification for each site.",
    expectedEvidence: [
      "NVWA registration or documented exception, annual confirmation where required, hygiene plan and inspection records",
    ],
    sourceIds: ["nl-food-register", "nl-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "State the actual non-food-business or DUO-school exception and check an uncertain activity with NVWA or the municipality.",
  }),
  action({
    id: "nl.transport",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: transport,
    action:
      "Classify transport the site provides or contracts and verify any commercial bus or taxi licence, driver and vehicle conditions.",
    applicabilityExplanation:
      "Commercial bus/taxi routes differ from non-commercial domestic own-account transport; cross-border own-account buses have separate attestation rules.",
    unknownExplanation:
      "Confirm vehicle, passengers, payment, operator, route, border crossings and contractor licences with Kiwa or ILT.",
    expectedEvidence: [
      "Transport classification, operator/contractor licence, vehicle and driver verification",
    ],
    sourceIds: ["nl-bus", "nl-taxi"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe who actually carries participants and verify uncertain commercial or own-account status with Kiwa, ILT or the municipality.",
  }),
  action({
    id: "nl.trips",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan supervision, risk controls, emergency contacts and appropriate family information for actual trips and off-site activities.",
    applicabilityExplanation:
      "Curriculum trips may be required school activities; trip permissions and overseas travel consent are separate from portal user agreements.",
    unknownExplanation:
      "Confirm school category, age, destination, transport, supervision and whether travel crosses a border.",
    expectedEvidence: [
      "Trip assessment, supervision plan, family notice or permission and transport checks",
    ],
    sourceIds: ["nl-trips", "nl-bus"],
    signalKeys: ["trips"],
  }),
];
