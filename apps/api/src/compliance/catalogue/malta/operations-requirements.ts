import type { CatalogueRequirement } from "../schema";
import { childCare, children, maltaRequirement as action } from "./shared";

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

export const maltaOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "mt.operator-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the legal operator, responsible people, complaints route and any separate voluntary-organisation status.",
    applicabilityExplanation:
      "A Charity or Church screen does not prove enrolment as a voluntary organisation or a particular legal form.",
    unknownExplanation:
      "Confirm registration, governing body and any Commissioner for Voluntary Organisations enrolment.",
    expectedEvidence: [
      "Operator registration, leadership record, complaints procedure and VO decision where applicable",
    ],
    sourceIds: ["mt-education-act", "mt-voluntary-act"],
    signalKeys: ["agreements"],
  }),
  action({
    id: "mt.voluntary-returns",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "If the operator is enrolled as a Maltese voluntary organisation, check its governing and annual-return duties.",
    applicabilityExplanation:
      "The duties depend on actual enrolment, not charitable branding in Nexsteps.",
    unknownExplanation:
      "Confirm operator legal form, VO enrolment number and applicable reporting tier.",
    expectedEvidence: [
      "VO enrolment and current governance or annual-return evidence",
    ],
    sourceIds: ["mt-voluntary-act"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "State the operator's actual status and confirm uncertain enrolment with the Commissioner or local authority.",
  }),
  action({
    id: "mt.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data flows and identify controller and processor roles.",
    applicabilityExplanation:
      "Portal evidence does not decide the lawful basis or the operator's controller status.",
    unknownExplanation:
      "Confirm purposes, recipients, processors, retention and cross-border transfers.",
    expectedEvidence: ["Processing map and controller or processor assessment"],
    sourceIds: ["mt-gdpr", "mt-idpc-education"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "mt.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, privacy information, rights handling, retention, access control and breach response for processing the site controls.",
    applicabilityExplanation:
      "GDPR and Malta's data-protection rules follow actual controlled processing, including special-category information.",
    unknownExplanation:
      "Confirm controller role, data categories and applicable education-sector provisions.",
    expectedEvidence: [
      "Lawful-basis record, privacy notices, retention schedule, rights and breach procedures",
    ],
    sourceIds: ["mt-gdpr", "mt-idpc-education"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "mt.dpia-dpo",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess high-risk processing for a DPIA and record whether the legal DPO triggers apply.",
    applicabilityExplanation:
      "Neither a DPIA nor a DPO is universal; evaluate the actual processing and scale.",
    unknownExplanation:
      "Confirm sensitive data, scale, systematic monitoring and core activities with the IDPC.",
    expectedEvidence: [
      "DPIA screening, completed assessment where required and DPO decision",
    ],
    sourceIds: ["mt-gdpr", "mt-idpc-dpia"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and verify uncertain high-risk processing with the IDPC or local authority.",
  }),
  action({
    id: "mt.workplace-safety",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess workplace hazards, preventive measures, incidents, first aid and staff information for the site's actual work.",
    applicabilityExplanation:
      "Employer duties apply to actual work and site conditions; a screen choice alone does not determine a risk assessment.",
    unknownExplanation:
      "Confirm employer status, premises, hazards, staff, contractors and OHSA instructions.",
    expectedEvidence: [
      "Risk assessment, preventive plan, incident and first-aid arrangements",
    ],
    sourceIds: ["mt-work-safety", "mt-ohsa-competent"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "mt.premises-conditions",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Confirm site planning use, fire precautions, accessibility, medical response and inspection conditions for the actual licence or activity.",
    applicabilityExplanation:
      "School, ECEC and community sites can have different approvals and site-specific conditions.",
    unknownExplanation:
      "Confirm operator control, planning use, age groups, occupancy and licence conditions with DQSE, Planning Authority or local council.",
    expectedEvidence: [
      "Premises approval, fire and accessibility assessment, inspection and first-aid records",
    ],
    sourceIds: ["mt-school-conditions", "mt-ecec-criteria", "mt-work-safety"],
    signalKeys: ["medical"],
  }),
  action({
    id: "mt.child-medical-arrangements",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain age-appropriate medical, allergy, emergency-contact and incident arrangements with restricted access to health records.",
    applicabilityExplanation:
      "The practical arrangements follow actual child-facing activities and the site's licence conditions.",
    unknownExplanation:
      "Confirm ages, care provided, health needs, consent and staff competence.",
    expectedEvidence: [
      "Medical response procedure, restricted care plans and incident records",
    ],
    sourceIds: ["mt-ecec-criteria", "mt-school-conditions", "mt-gdpr"],
    signalKeys: ["medical"],
  }),
  action({
    id: "mt.food-business",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Where the operator runs a food business, check food-premises registration, hygiene controls and actual food-handler training or cards.",
    applicabilityExplanation:
      "A canteen or tuck shop may need registration; food-handling duties follow actual operations and roles.",
    unknownExplanation:
      "Confirm food activity, operator, frequency, preparation and handlers with the Food Safety Commission or local authority.",
    expectedEvidence: [
      "Food-premises registration, hygiene procedures, handler records and inspection results",
    ],
    sourceIds: ["mt-food-premises", "mt-food-handlers", "mt-food-hygiene"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the activity is not a food business and verify borderline catering with the Food Safety Commission or local authority.",
  }),
  action({
    id: "mt.transport",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: transport,
    action:
      "Check operator, vehicle, driver and child-passenger conditions for transport the site actually provides or contracts.",
    applicabilityExplanation:
      "Hire-or-reward and school-child services have different Transport Malta routes; no transport means no transport licence.",
    unknownExplanation:
      "Confirm vehicle seats, payment, operator, driver and whether children are carried.",
    expectedEvidence: [
      "Operator or contractor licence, vehicle and driver checks, passenger-safety procedure",
    ],
    sourceIds: ["mt-transport", "mt-school-transport"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe who transports participants and confirm uncertain hire-or-reward classification with Transport Malta or the local authority.",
  }),
  action({
    id: "mt.trips",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan trip supervision, risk controls, emergency contacts and parent permissions for actual off-site activities.",
    applicabilityExplanation:
      "Trip controls follow the participants and activity; trip permissions remain separate from user agreements.",
    unknownExplanation:
      "Confirm destination, ages, transport, supervision and activity-specific authority requirements.",
    expectedEvidence: [
      "Trip assessment, supervision plan, permission and incident procedure",
    ],
    sourceIds: [
      "mt-safeguarding-policy",
      "mt-school-transport",
      "mt-work-safety",
    ],
    signalKeys: ["trips"],
  }),
  action({
    id: "mt.ecec-health",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: childCare,
    action:
      "For 0–3 ECEC provision, check the licence's hygiene, sleeping, outdoor, medical and emergency arrangements.",
    applicabilityExplanation:
      "These conditions vary with the actual DQSE 0–3 licence and premises.",
    unknownExplanation:
      "Confirm ages, rooms, care schedule and approved licence conditions.",
    expectedEvidence: [
      "ECEC premises checklist, inspection report and emergency records",
    ],
    sourceIds: ["mt-ecec-criteria", "mt-ecec-licence"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the provision is outside DQSE 0–3 ECEC and confirm doubtful cases with DQSE or the local authority.",
  }),
];
