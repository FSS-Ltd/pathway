import type { CatalogueRequirement } from "../schema";
import { franceRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const underSix = { field: "minimumAge", op: "lte", value: 5 } as const;
const independentSchool = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const specialDepartments: NonNullable<CatalogueRequirement["condition"]> = {
  any: ["FR-57", "FR-67", "FR-68"].map((value) => ({
    field: "subdivisionCode",
    op: "eq",
    value,
  })),
};
const care: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const franceRequirements: CatalogueRequirement[] = [
  action({
    id: "fra.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, under-six care and collective-minor activities with the academy, department or local authority.",
    applicabilityExplanation:
      "A school screen, ACE label, charity status or public Learning Centre type does not establish French legal status or public funding. School, EAJE and ACM routes differ.",
    unknownExplanation:
      "Record ages, hours, instruction, supervision, overnight stays and operating department; seek written authority classification if uncertain.",
    expectedEvidence: [
      "Provision assessment and competent-authority classification advice",
    ],
    sourceIds: [
      "fra-private-school-guidance",
      "fra-collective-minors-definitions",
      "fra-eaje-law",
    ],
    signalKeys: [],
  }),
  action({
    id: "fra.private-school-declaration",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [independentSchool, { not: specialDepartments }] },
    action:
      "For a private school outside Bas-Rhin, Haut-Rhin and Moselle, confirm its rectorate opening declaration and any opposition outcome before operating.",
    applicabilityExplanation:
      "Education Code article L441-1 provides the general declaration route and three-month opposition period; whether a Learning Centre is a school requires assessment of actual provision.",
    unknownExplanation:
      "Confirm school status, the operating department, the declaration file and the rectorate's response before dismissing this route.",
    expectedEvidence: [
      "Rectorate declaration receipt, opening date and opposition or inspection correspondence",
    ],
    sourceIds: [
      "fra-private-school-code",
      "fra-private-school-guidance",
      "fra-departments",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the actual provision is not a private school and confirm the correct opening route with the academy rectorate.",
  }),
  action({
    id: "fra.local-law-school-authorisation",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [independentSchool, specialDepartments] },
    action:
      "For a private school in Bas-Rhin, Haut-Rhin or Moselle, retain the required prior authorisation before opening.",
    applicabilityExplanation:
      "Education Code article L481-1 retains a prior-authorisation route in these three departments; the general declaration rule alone is insufficient there.",
    unknownExplanation:
      "Select the actual operating department and confirm the decision with the competent education authority.",
    expectedEvidence: [
      "Prior authorisation and relevant school opening correspondence",
    ],
    sourceIds: ["fra-local-school-law", "fra-departments"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the service is not a private school and verify that conclusion with the competent education authority.",
  }),
  action({
    id: "fra.acm-declaration",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess whether organised child activities are an accueil collectif de mineurs (ACM) and, if so, retain the required TAM declarations.",
    applicabilityExplanation:
      "The youth ministry distinguishes regulated ACM from other tutoring and club activity. Declaration deadlines and any accommodation declaration depend on the ACM form.",
    unknownExplanation:
      "Confirm ages, group size, duration, supervision, leisure or overnight pattern and departmental SDJES classification.",
    expectedEvidence: [
      "ACM classification, TAM initial and complementary declarations or written reason for exclusion",
    ],
    sourceIds: ["fra-collective-minors", "fra-collective-minors-definitions"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the activity does not meet the ACM definition; confirm uncertain cases with the local SDJES before skipping.",
  }),
  action({
    id: "fra.eaje-authorisation",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [care, underSix] },
    action:
      "For an establishment caring for children under six, retain the departmental EAJE authorisation and assess whether prior local organising-authority approval is needed.",
    applicabilityExplanation:
      "Public Health Code article L2324-1 requires departmental authorisation; a privately operated EAJE first needs a favourable opinion from the competent local organising authority. Funding status alone does not prove operator type.",
    unknownExplanation:
      "Confirm actual care form, operator, ages, premises, capacity, municipality and any existing authorisation or transition.",
    expectedEvidence: [
      "Departmental authorisation, approved capacity, and local favourable opinion where privately operated",
    ],
    sourceIds: ["fra-eaje-law", "fra-eaje-application", "fra-eaje-2026-faq"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the service is outside the EAJE route and confirm uncertain classification with the department or PMI service.",
  }),
  action({
    id: "fra.child-danger-reporting",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a route for staff to report a child in danger promptly through 119 or the competent child-protection or judicial service.",
    applicabilityExplanation:
      "Official guidance states that anyone witnessing or suspecting danger should report it; the local route depends on urgency and the facts.",
    unknownExplanation:
      "Confirm learner ages, emergency contacts, staff roles and departmental child-protection contacts.",
    expectedEvidence: [
      "Reporting procedure, staff briefing and restricted referral record",
    ],
    sourceIds: ["fra-child-reporting"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "fra.acm-personnel",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "If operating an ACM, verify director and animator qualifications, supervision ratios and role-relevant disqualification checks through the permitted route.",
    applicabilityExplanation:
      "ACM personnel and honourability checks depend on actual child-facing roles and declared ACM status, not an adult or parent portal account.",
    unknownExplanation:
      "Confirm ACM classification, staff duties, qualifications and SDJES verification process before deciding applicability.",
    expectedEvidence: [
      "Role roster, qualification and ratio review, permitted check outcome and dates",
    ],
    sourceIds: ["fra-collective-minors", "fra-acm-staff-check"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no ACM role exists and confirm any uncertain activity classification with the local SDJES.",
  }),
  action({
    id: "fra.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding processing and identify the controller for each purpose.",
    applicabilityExplanation:
      "GDPR and CNIL education guidance apply to actual processing; an agreement acknowledgement is not itself a lawful basis for every activity.",
    unknownExplanation:
      "Identify purposes, recipients, processors, retention and special-category data before concluding which controls apply.",
    expectedEvidence: ["Processing map and controller or processor assessment"],
    sourceIds: ["fra-gdpr", "fra-cnil-education"],
    signalKeys: [],
  }),
  action({
    id: "fra.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention, security and incident handling for the personal data this site controls.",
    applicabilityExplanation:
      "GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; health data also need an Article 9 condition. Breach notification, DPIA and DPO duties are conditional.",
    unknownExplanation:
      "Confirm controller status, processing risks, sensitive data and any notification or impact-assessment trigger.",
    expectedEvidence: [
      "Lawful-basis record, notices, retention schedule, access controls and breach procedure",
    ],
    sourceIds: ["fra-gdpr", "fra-cnil-education", "fra-cnil-breach"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "fra.duerp",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: employer,
    action:
      "Assess staff health and safety risks and maintain the document unique d'évaluation des risques professionnels (DUERP).",
    applicabilityExplanation:
      "The employer risk-assessment duty concerns actual workers and workplace risks; it is separate from safety of public-access premises.",
    unknownExplanation:
      "Confirm employment arrangements, workplaces and the persons responsible for risk controls.",
    expectedEvidence: ["Current DUERP and prevention action record"],
    sourceIds: ["fra-duerp"],
    signalKeys: [],
  }),
  action({
    id: "fra.erp-safety",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Classify any public-access premises and check fire, evacuation, accessibility and opening requirements for its ERP type and capacity.",
    applicabilityExplanation:
      "ERP duties depend on the actual building, operator, public access and capacity; a shared or hosted site may have split responsibilities.",
    unknownExplanation:
      "Confirm premises control, ERP classification, capacity and local building or fire authority decisions.",
    expectedEvidence: [
      "ERP classification, fire and evacuation records, accessibility evidence and authority correspondence",
    ],
    sourceIds: ["fra-erp-fire", "fra-erp-access"],
    signalKeys: [],
  }),
  action({
    id: "fra.private-school-learning",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: independentSchool,
    action:
      "For a private school outside a state contract, review its teaching against the common core and retain evidence for the first-year inspection.",
    applicabilityExplanation:
      "Hors-contrat schools do not have to follow the public timetable or programme, but must enable children to acquire the common core and undergo controls. A tutoring centre is not automatically such a school.",
    unknownExplanation:
      "Confirm actual school and contract status, ages, teaching scope and academy inspection plan.",
    expectedEvidence: [
      "Curriculum mapping, learner assessment and inspection correspondence",
    ],
    sourceIds: ["fra-private-school-guidance", "fra-private-school-code"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the service is not a hors-contrat school and verify unclear status with the academy rectorate.",
  }),
  action({
    id: "fra.eaje-conditions",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [care, underSix] },
    action:
      "For authorised under-six care, review approved ages, capacity, staffing and operating conditions against the current departmental decision.",
    applicabilityExplanation:
      "EAJE authorisations and their conditions vary by service form and department; a childcare checkbox does not establish a specific staffing ratio.",
    unknownExplanation:
      "Confirm EAJE category, authorisation, ages, staffing plan and local PMI requirements.",
    expectedEvidence: [
      "Current authorisation, staffing and capacity review, and inspection follow-up",
    ],
    sourceIds: ["fra-eaje-law", "fra-eaje-application", "fra-eaje-2026-faq"],
    signalKeys: ["personnel", "attendance"],
  }),
  action({
    id: "fra.food-business",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: food,
    action:
      "For regular food service, assess food-business registration, hygiene procedures and activity-specific staff training.",
    applicabilityExplanation:
      "EU food-hygiene rules and current French catering guidance depend on the actual food activity; occasional low-risk events and central kitchens may use different routes.",
    unknownExplanation:
      "Confirm preparation, regularity, customers, delivery and the competent départemental food-control route.",
    expectedEvidence: [
      "Food activity classification, declaration or approval, hygiene plan and staff training",
    ],
    sourceIds: ["fra-food-hygiene", "fra-food-training"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual activity falls outside the continuing food-business route and check with local food control if uncertain.",
  }),
  action({
    id: "fra.trips-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Check whether organised trips or overnight activities change ACM declarations, accommodation or supervision requirements.",
    applicabilityExplanation:
      "The ACM route depends on the actual duration, accommodation, ages and organiser. A trip permission record does not itself establish regulatory approval.",
    unknownExplanation:
      "Record destinations, overnight pattern, transport, supervision and SDJES advice where classification is uncertain.",
    expectedEvidence: [
      "Trip risk and supervision review, relevant ACM or accommodation declarations and parent permissions",
    ],
    sourceIds: ["fra-collective-minors"],
    signalKeys: ["trips"],
  }),
  action({
    id: "fra.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal for qualifications actually offered.",
    applicabilityExplanation:
      "ICCE requirements apply only to participating providers; ACE branding or French school status alone does not establish ICCE participation or local qualification recognition.",
    unknownExplanation:
      "Confirm whether ICCE qualifications are offered and any French recognition or provider-permission issue.",
    expectedEvidence: ["Current ICCE registration and renewal correspondence"],
    sourceIds: ["fra-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "fra.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Check ICCE student enrolment, approved academic projections and moderation for qualifications actually offered.",
    applicabilityExplanation:
      "These are provider requirements for ICCE participants, separate from French education authorisation.",
    unknownExplanation:
      "Confirm participating students, level, approved projections and moderation cycle.",
    expectedEvidence: ["Enrolment, approved projection and moderation records"],
    sourceIds: ["fra-icce-enrolment", "fra-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
