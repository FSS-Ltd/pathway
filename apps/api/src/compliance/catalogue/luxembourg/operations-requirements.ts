import type { CatalogueRequirement } from "../schema";
import {
  childCare,
  children,
  luxembourgRequirement as action,
  outOfSchool,
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

export const luxembourgOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "lux.operator-form",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Confirm the actual legal operator, responsible people, business-permit position and relevant association or public-benefit status.",
    applicabilityExplanation:
      "A charity, church or school screen does not itself establish ASBL status, public-utility recognition or a business permit.",
    unknownExplanation:
      "Confirm legal form, commercial activity, responsible people and any separate ministerial recognition.",
    expectedEvidence: [
      "Operator record, governing documents and applicable permit or recognition decision",
    ],
    sourceIds: [
      "lux-asbl-formation",
      "lux-business-permit",
      "lux-public-benefit",
    ],
    signalKeys: [],
  }),
  action({
    id: "lux.asbl-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "If the operator is an ASBL, keep its registration, statutes and governing-body records current; separately verify any claimed public-utility recognition.",
    applicabilityExplanation:
      "An association and a recognised public-utility association are distinct legal positions.",
    unknownExplanation:
      "Confirm the operator's exact legal form and any recognition claim.",
    expectedEvidence: [
      "ASBL registration, statutes, leadership record and recognition decision where claimed",
    ],
    sourceIds: ["lux-asbl-formation", "lux-public-benefit"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the operator's other legal form and verify an uncertain association or recognition claim with the competent registry or ministry.",
  }),
  action({
    id: "lux.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map the site's learner, family, staff, health and safeguarding processing and identify the controller and processors.",
    applicabilityExplanation:
      "Portal records are evidence of processing but do not themselves decide every lawful basis or controller role.",
    unknownExplanation:
      "Confirm purposes, data categories, systems, recipients, retention and decision-making roles.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["lux-gdpr", "lux-cnpd-obligations"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "lux.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, sensitive-data safeguards, retention, rights handling, access controls and breach response for processing the site controls.",
    applicabilityExplanation:
      "GDPR controller duties follow actual processing; health and child data need their own legal assessment.",
    unknownExplanation:
      "Confirm controller status, purposes, special-category data, recipients and current CNPD guidance.",
    expectedEvidence: [
      "Lawful-basis and special-category assessment, notices, retention schedule, rights and breach procedures",
    ],
    sourceIds: ["lux-gdpr", "lux-cnpd-obligations"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "lux.dpia-dpo",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether actual processing triggers a DPIA or DPO, and keep the decision under review after material changes.",
    applicabilityExplanation:
      "GDPR DPIA and DPO duties are conditional; a medical field alone does not establish every trigger.",
    unknownExplanation:
      "Confirm scale, sensitive data, monitoring, vulnerable people and public-body status.",
    expectedEvidence: [
      "Documented trigger assessment and DPIA or DPO records where required",
    ],
    sourceIds: ["lux-gdpr", "lux-cnpd-dpo", "lux-cnpd-obligations"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no DPIA or DPO trigger applies, and check uncertainty against CNPD guidance before dismissing it.",
  }),
  action({
    id: "lux.work-safety",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess worker health and safety risks, protective measures, instruction and designated safety responsibilities for actual staff and volunteers where covered.",
    applicabilityExplanation:
      "Employer duties follow the actual employment and work activities; the portal review date is not a statutory expiry.",
    unknownExplanation:
      "Confirm workers, hazards, site control and designated-worker arrangements.",
    expectedEvidence: [
      "Risk assessment, preventive actions, staff instruction and responsible-person record",
    ],
    sourceIds: ["lux-work-safety", "lux-designated-worker"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "lux.premises-fire-first-aid",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Review fire precautions, evacuation, first aid, accessibility and incident arrangements for the controlled premises and actual occupancy.",
    applicabilityExplanation:
      "The detailed premises obligations depend on use, capacity and authority approvals, including ITM conditions for a qualifying SEA.",
    unknownExplanation:
      "Confirm building use, occupancy, controller, safety approvals and people needing assistance.",
    expectedEvidence: [
      "Site risk and evacuation review, first-aid arrangements and authority correspondence",
    ],
    sourceIds: ["lux-sea-approval", "lux-work-safety"],
    signalKeys: ["medical"],
  }),
  action({
    id: "lux.sea-premises",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "Where SEA approval applies, verify the qualifying ITM premises authorisation, approved site capacity and child-safety conditions.",
    applicabilityExplanation:
      "The SEA route can require prior class 3A premises authorisation and approval-specific operating conditions.",
    unknownExplanation:
      "Confirm actual SEA route, building classification, approval holder and site capacity.",
    expectedEvidence: [
      "ITM authorisation, MENJE site approval and premises inspection records",
    ],
    sourceIds: ["lux-sea-approval", "lux-mini-creche"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the authority-confirmed reason the site is outside this SEA premises route; check borderline provision with MENJE and ITM.",
  }),
  action({
    id: "lux.out-of-school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Document the learning centre's actual out-of-school programme, ages, hours and parent information, and assess whether another regulated education or care route is triggered.",
    applicabilityExplanation:
      "A learning centre does not become a state-funded school merely because it is non-ACE; paid childcare or formal schooling may need separate approval.",
    unknownExplanation:
      "Confirm programme, age groups, duration, fees, full-time status and qualifications offered.",
    expectedEvidence: [
      "Programme description, family terms and written classification assessment",
    ],
    sourceIds: [
      "lux-private-school-law",
      "lux-sea-approval",
      "lux-adult-training",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "lux.adult-nationality-courses",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { field: "maximumAge", op: "gte", value: 18 },
    action:
      "If offering a state-recognised adult integration or nationality course, verify that programme's separate approval and attendance rules.",
    applicabilityExplanation:
      "Ordinary adult tutoring does not automatically require recognition under the nationality-course programme.",
    unknownExplanation:
      "Confirm whether the course is advertised for an official integration or nationality purpose.",
    expectedEvidence: [
      "Programme description and official approval or written out-of-scope assessment",
    ],
    sourceIds: ["lux-adult-training", "lux-adult-nationality-course"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the centre offers no official integration or nationality course; verify uncertain claims with the adult-education authority.",
  }),
  action({
    id: "lux.medical-needs",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Set a restricted process for relevant child medical needs, emergency contacts, first aid and incident escalation.",
    applicabilityExplanation:
      "The required arrangements depend on actual services and individual needs; an empty allergy field is not proof of no allergies.",
    unknownExplanation:
      "Confirm information collection, permissions, staff access and escalation contacts.",
    expectedEvidence: [
      "Medical-information process, first-aid arrangements and restricted individual plans where needed",
    ],
    sourceIds: ["lux-sea-approval", "lux-child-protection"],
    signalKeys: ["medical"],
  }),
  action({
    id: "lux.food-operation",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Confirm the actual food business operator's ALVA registration or notification and maintain appropriate hygiene procedures.",
    applicabilityExplanation:
      "Food obligations follow preparation, serving and the operator; a school or care label alone is insufficient.",
    unknownExplanation:
      "Confirm food activities, outsourced suppliers, premises and responsible operator.",
    expectedEvidence: [
      "Food-operator notification or registration, supplier arrangements and hygiene controls",
    ],
    sourceIds: ["lux-food-register", "lux-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "lux.passenger-transport",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: transport,
    action:
      "Classify the actual passenger transport service and verify any commercial or community licence, driver and vehicle conditions.",
    applicabilityExplanation:
      "Transport licensing depends on the operation and vehicle; an occasional private journey does not automatically require a carrier licence.",
    unknownExplanation:
      "Confirm operator, payment, vehicle capacity, route and cross-border activity.",
    expectedEvidence: [
      "Transport classification, licences where required, vehicle and driver records",
    ],
    sourceIds: ["lux-transport-licence"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual journeys are outside the cited licensed transport route and verify uncertainty with the transport authority.",
  }),
  action({
    id: "lux.trips",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan supervision, risk controls, family information and emergency contacts for actual trips; review school-specific and cross-border instructions where relevant.",
    applicabilityExplanation:
      "The ministry's school-trip circular is not automatically binding on every club or adult programme.",
    unknownExplanation:
      "Confirm ages, itinerary, transport, cross-border travel and the provider's legal status.",
    expectedEvidence: [
      "Trip plan, risk review, family information and applicable travel documentation",
    ],
    sourceIds: ["lux-school-trips", "lux-child-protection"],
    signalKeys: ["trips"],
  }),
];
