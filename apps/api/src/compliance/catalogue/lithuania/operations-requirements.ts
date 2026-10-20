import type { CatalogueRequirement } from "../schema";
import {
  children,
  lithuaniaRequirement as action,
  municipality,
  preschool,
  school,
} from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const foodBusiness = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const transport: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "transport", op: "eq", value: true },
    { field: "operatesVehicles", op: "eq", value: true },
  ],
};
const icce = { field: "icce", op: "eq", value: true } as const;

export const lithuaniaOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "ltu.entity-form",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "Confirm the operator's actual registered legal form, such as association, foundation or public institution, and keep its governance records current.",
    applicabilityExplanation:
      "A charity-facing Nexsteps screen does not establish a Lithuanian legal entity or support-recipient status.",
    unknownExplanation:
      "Confirm legal operator, register entry, governing documents and responsible officers.",
    expectedEvidence: [
      "Legal Entities Register entry, governing documents and current responsible people",
    ],
    sourceIds: ["ltu-entity-register"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the operator's other legal form and verify unclear entity status with the Centre of Registers.",
  }),
  action({
    id: "ltu.religious-form",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "sector", op: "eq", value: "CHURCH" },
    action:
      "Confirm whether the operator claims Lithuanian religious-community or association status and retain the relevant Ministry and register records.",
    applicabilityExplanation:
      "A church portal selection does not establish state recognition, a registered religious form or exemption from education and child-safety duties.",
    unknownExplanation:
      "Confirm community type, legal operator, Ministry decision and any separate education provider.",
    expectedEvidence: [
      "Ministry/Legal Entities Register record or written legal-form assessment",
    ],
    sourceIds: ["ltu-religious-register", "ltu-entity-register"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no Lithuanian religious-organisation status is claimed and verify uncertainty with the Ministry of Justice.",
  }),
  action({
    id: "ltu.support-recipient",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "Where support-recipient status is claimed, verify its actual register status and applicable activity conditions.",
    applicabilityExplanation:
      "Support-recipient status and non-governmental-organisation marking are distinct from a charity or association screen; traditional religious bodies can follow exceptions.",
    unknownExplanation:
      "Confirm registered entity, support-recipient claim and tax authority or register evidence.",
    expectedEvidence: [
      "Support-recipient status lookup and any relevant authority decision",
    ],
    sourceIds: ["ltu-support-recipient", "ltu-entity-register"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record that no Lithuanian support-recipient status is claimed and check uncertain cases with the State Tax Inspectorate.",
  }),
  action({
    id: "ltu.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data uses and identify each controller and processor.",
    applicabilityExplanation:
      "Portal agreements or an allergy record do not by themselves establish every lawful basis or controller obligation.",
    unknownExplanation:
      "Record purposes, special-category data, recipients, systems, retention and controller decisions.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["ltu-gdpr", "ltu-privacy-authority"],
    signalKeys: [],
  }),
  action({
    id: "ltu.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, notices, child and health-data safeguards, retention, rights handling, access controls and breach response for processing this site controls.",
    applicabilityExplanation:
      "GDPR controller duties follow actual processing; special-category and breach-notification conditions depend on their legal triggers.",
    unknownExplanation:
      "Confirm controller status, data categories, scale, rights requests and current State Data Protection Inspectorate directions.",
    expectedEvidence: [
      "Lawful-basis record, notices, retention schedule, rights process, access review and breach plan",
    ],
    sourceIds: ["ltu-gdpr", "ltu-privacy-authority"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "ltu.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether actual child, health, monitoring or large-scale processing triggers a DPIA or DPO requirement.",
    applicabilityExplanation:
      "GDPR DPIA and DPO duties are conditional; storing an allergy field alone does not prove every trigger.",
    unknownExplanation:
      "Confirm processing scale, sensitive categories, vulnerable people, monitoring and public-body status.",
    expectedEvidence: [
      "Documented trigger assessment and DPIA/DPO records where required",
    ],
    sourceIds: ["ltu-gdpr", "ltu-privacy-authority"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why neither trigger applies, revisit after material processing changes and consult the Inspectorate when uncertain.",
  }),
  action({
    id: "ltu.school-hygiene-passport",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Verify the general-education school's hygiene passport and review HN 21 premises, first-aid and health-safety arrangements.",
    applicabilityExplanation:
      "HN 21 applies to schools implementing general-education programmes; a club or non-formal centre must be classified separately.",
    unknownExplanation:
      "Confirm formal programme, operating site, passport holder, first-aid equipment and current public-health conditions.",
    expectedEvidence: [
      "Current hygiene passport, premises review, first-aid arrangements and authority correspondence",
    ],
    sourceIds: ["ltu-school-hygiene", "ltu-school-hygiene-passport"],
    signalKeys: ["medical", "personnel"],
  }),
  action({
    id: "ltu.preschool-hygiene-passport",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: preschool,
    action:
      "Verify the preschool or pre-primary programme's hygiene passport and HN 75 group, premises, outdoor and health conditions.",
    applicabilityExplanation:
      "HN 75 requires a separate covered-programme permission; a school passport or camp arrangement does not replace it.",
    unknownExplanation:
      "Confirm programme, site, operator, child ages, group size and National Public Health Centre decisions.",
    expectedEvidence: [
      "Current preschool hygiene passport, group/premises review and authority correspondence",
    ],
    sourceIds: ["ltu-preschool-hygiene"],
    signalKeys: ["medical", "attendance"],
  }),
  action({
    id: "ltu.work-risk-assessment",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Maintain the employer's occupational-risk assessment and protective arrangements for actual workers and activities.",
    applicabilityExplanation:
      "Workplace risk assessment follows employer status; the portal's annual reminder is not a universal statutory deadline.",
    unknownExplanation:
      "Confirm workers, sites, hazards, responsible safety roles and protective measures.",
    expectedEvidence: [
      "Risk assessment, protective action plan, staff instruction and review records",
    ],
    sourceIds: ["ltu-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "ltu.fire-safety",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Review site fire protection, evacuation, equipment and instruction for the premises and actual activities.",
    applicabilityExplanation:
      "Exact fire-safety duties depend on building use, occupancy, control and public authority decisions.",
    unknownExplanation:
      "Confirm premises controller, use, occupancy and the responsible fire-safety authority.",
    expectedEvidence: [
      "Fire-risk and evacuation review, equipment checks and authority correspondence",
    ],
    sourceIds: ["ltu-fire-safety"],
    signalKeys: [],
  }),
  action({
    id: "ltu.food-business",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: foodBusiness,
    action:
      "Confirm any qualifying food operator is registered or approved with the State Food and Veterinary Service and follows food-hygiene procedures.",
    applicabilityExplanation:
      "Registration and hygiene follow the actual catering activity and operator, not the school's or centre's label.",
    unknownExplanation:
      "Confirm whether food is prepared, served or outsourced, and identify the operator and premises.",
    expectedEvidence: [
      "Food-operator registration or approval, supplier arrangements and hygiene procedures",
    ],
    sourceIds: ["ltu-food-register", "ltu-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "ltu.camp-classification",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Classify any organised child holiday or overnight activity before applying the children's-camp health-safety route.",
    applicabilityExplanation:
      "An ordinary school trip or boarding arrangement is not automatically a children's rest camp; HN 79 follows the actual activity.",
    unknownExplanation:
      "Confirm participant ages, programme, dates, overnight provision, food and operating municipality.",
    expectedEvidence: [
      "Written activity classification and public-health or municipality advice for uncertain events",
    ],
    sourceIds: ["ltu-camp-hygiene", "ltu-camp-guidance"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no event is a covered children's camp and check doubtful cases with the municipality or National Public Health Centre.",
  }),
  action({
    id: "ltu.camp-health-safety",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [children, municipality] },
    action:
      "For an actual children's rest camp, apply HN 79 health-safety, supervision, accommodation and food arrangements.",
    applicabilityExplanation:
      "HN 79 applies to qualifying camps; the National Public Health Centre states that a separate camp hygiene passport is not issued.",
    unknownExplanation:
      "Confirm camp classification, site, children, leader, day or overnight form, catering and municipality.",
    expectedEvidence: [
      "Camp programme, site and safety review, health arrangements and authority correspondence",
    ],
    sourceIds: ["ltu-camp-hygiene", "ltu-camp-guidance", "ltu-municipalities"],
    signalKeys: ["trips", "medical", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered camp operates and verify any uncertain classification with the local authority or National Public Health Centre.",
  }),
  action({
    id: "ltu.child-trip-safety",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { all: [children, trips] },
    action:
      "Review supervision, risk, transport and family information for educational hikes, excursions, competitions and other child trips.",
    applicabilityExplanation:
      "The educational tourism route depends on the actual provider and event; an ordinary trip is not automatically a registered camp.",
    unknownExplanation:
      "Confirm provider status, child ages, event type, leaders, transport and current municipality directions.",
    expectedEvidence: [
      "Trip plan, risk assessment, responsible adults, transport review and family permission records",
    ],
    sourceIds: ["ltu-child-trips", "ltu-child-rights"],
    signalKeys: ["trips", "personnel"],
  }),
  action({
    id: "ltu.transport-route",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: transport,
    action:
      "Classify any pupil or passenger transport actually operated and check school-bus, driver, vehicle, escort and operator-licensing duties.",
    applicabilityExplanation:
      "School-bus and passenger-carriage rules vary by vehicle, route, operator and whether transport is provided for reward.",
    unknownExplanation:
      "Confirm operator, route, vehicle, passenger ages, drivers, escorts and paid service status.",
    expectedEvidence: [
      "Transport-route assessment, driver/vehicle records, operator permission and safety procedure where required",
    ],
    sourceIds: ["ltu-school-transport", "ltu-transport-licensing"],
    signalKeys: ["trips", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site does not operate covered transport and verify doubtful routes with the transport authority or municipality.",
  }),
  action({
    id: "ltu.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep the site's ICCE provider registration, training, quality review and renewal arrangements current where ICCE qualifications are offered.",
    applicabilityExplanation:
      "ICCE participation is separate from Lithuanian school registration, foreign-programme consent and recognition.",
    unknownExplanation:
      "Confirm actual ICCE provider, qualifications offered and current provider approval.",
    expectedEvidence: [
      "ICCE registration, training, quality-review and renewal correspondence",
    ],
    sourceIds: ["ltu-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "ltu.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Review ICCE learner enrolment, approved projections and moderation evidence for actual participants.",
    applicabilityExplanation:
      "Portal ACE records can show gaps but cannot establish ICCE acceptance or Lithuanian qualification recognition.",
    unknownExplanation:
      "Confirm eligible learners, ICCE registration, projections and moderation period.",
    expectedEvidence: [
      "ICCE enrolment confirmations, approved projections and moderation outcomes",
    ],
    sourceIds: ["ltu-icce-enrolment", "ltu-icce-moderation"],
    signalKeys: ["ace", "attendance"],
  }),
];
