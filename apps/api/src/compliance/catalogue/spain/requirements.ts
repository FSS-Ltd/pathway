import type { CatalogueRequirement } from "../schema";
import {
  children,
  earlyYears,
  school,
  spainRegionCodes,
  spainRequirement as action,
} from "./shared";

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

export const spainRequirements: CatalogueRequirement[] = [
  action({
    id: "es.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the legal operator, actual school or childcare status, ages, programme, site and competent autonomous-community education or social-services authority.",
    applicabilityExplanation:
      "ACE and portal sector are separate from private, public or publicly funded school status; a Learning Centre may be out-of-school provision.",
    unknownExplanation:
      "Confirm provider category, ages, full-time pattern, legal form, funding and municipality with the competent authority.",
    expectedEvidence: [
      "Operator and provider-classification assessment, site details and authority correspondence",
    ],
    sourceIds: ["es-education-law", "es-private-authorisation"],
    signalKeys: [],
  }),
  action({
    id: "es.school-authorisation",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Verify the school register entry and applicable authorisation for the actual education levels, operator and site with the competent education administration.",
    applicabilityExplanation:
      "Private, public and publicly funded private schools follow different legal routes; a screen choice or ACE participation grants none of them.",
    unknownExplanation:
      "Confirm the actual school category, levels, authorised site, operator and autonomous-community decision.",
    expectedEvidence: [
      "Authorisation or establishment decision, current centre register entry and approved levels",
    ],
    sourceIds: ["es-education-law", "es-private-authorisation"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the provision is not a school under applicable law and confirm borderline provision with the competent education administration.",
  }),
  ...spainRegionCodes.map((jurisdiction) =>
    action({
      id: `es.regional-authority-${jurisdiction}`,
      jurisdiction,
      topic: "registration_governance",
      obligationClass: "RECOMMENDATION",
      condition: null,
      action:
        "Confirm this site's competent education, childcare and municipal authorities and obtain the applicable territorial rules and decisions.",
      applicabilityExplanation:
        "The NUTS 2 code selects territory; autonomous-community or city law and local decisions are not established by a national checklist.",
      unknownExplanation:
        "Confirm the exact municipality, provider type, age range, premises and activities with the competent authority.",
      expectedEvidence: [
        "Territorial authority response, local rule inventory and site decisions",
      ],
      sourceIds: ["es-nuts", "es-education-law"],
      signalKeys: [],
    }),
  ),
  action({
    id: "es.childcare-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: earlyYears,
    action:
      "Determine the applicable early-education or childcare authorisation and register route for the actual ages, hours and premises before operating.",
    applicabilityExplanation:
      "First-cycle infant education and other childcare routes depend on autonomous-community implementation; the Nursery screen is insufficient.",
    unknownExplanation:
      "Confirm ages, programme, hours, operator, site and autonomous-community childcare rules.",
    expectedEvidence: [
      "Provider route assessment, relevant authorisation or registration and authority correspondence",
    ],
    sourceIds: ["es-education-law", "es-early-curriculum"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "es.legal-form",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify whether the legal operator is an association, foundation, religious entity, company or public body and verify its corresponding registration and governance route.",
    applicabilityExplanation:
      "A Church or Charity portal sector does not prove religious-entity, association or foundation legal status.",
    unknownExplanation:
      "Confirm the operator's legal form, governing documents and registering authority.",
    expectedEvidence: [
      "Legal-form record, register extract and governing documents",
    ],
    sourceIds: ["es-associations", "es-foundations", "es-religious-entities"],
    signalKeys: [],
  }),
  action({
    id: "es.child-protection-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Maintain a restricted procedure for promptly reporting suspected violence against children to the competent social services, police or prosecutor under the applicable route.",
    applicabilityExplanation:
      "LOPIVI Articles 15–16 include duties for people whose work involves children; local referral routes must be confirmed.",
    unknownExplanation:
      "Confirm child-facing work, the concern and the competent territorial referral authority.",
    expectedEvidence: [
      "Restricted reporting procedure, local contacts, staff briefing and incident audit trail",
    ],
    sourceIds: ["es-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "es.school-welfare-coordinator",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Designate the school welfare and protection coordinator and document the role, reporting routes and training.",
    applicabilityExplanation:
      "LOPIVI Article 35 applies to education centres with minors, regardless of ownership; it is not a duty for every club or adult account.",
    unknownExplanation:
      "Confirm the centre's school status, minor pupils and applicable autonomous-community requirements.",
    expectedEvidence: [
      "Coordinator appointment, role description, safeguarding procedure and training",
    ],
    sourceIds: ["es-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "es.child-facing-integrity",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "For roles involving habitual contact with minors, verify absence of relevant sexual-offence convictions through the lawful certificate route before appointment.",
    applicabilityExplanation:
      "LOPIVI Article 57 is role-specific; an adult or parent portal account alone does not trigger screening.",
    unknownExplanation:
      "Confirm each employee or volunteer role, habitual contact and lawful verification method.",
    expectedEvidence: [
      "Role matrix and restricted certificate-verification date, issuer and reviewer",
    ],
    sourceIds: ["es-child-protection"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no role involves habitual contact with minors and check doubtful role classifications with the competent authority.",
  }),
  action({
    id: "es.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful processing, child and health-data safeguards, privacy information, retention, rights handling, processors, access control and breach response.",
    applicabilityExplanation:
      "GDPR and Spanish data law follow the actual controller and processing; portal evidence does not establish a lawful basis or wider medical access.",
    unknownExplanation:
      "Confirm controller status, purposes, sensitive data, recipients and retention.",
    expectedEvidence: [
      "Processing record, notices, retention schedule, processor terms and breach procedure",
    ],
    sourceIds: ["es-gdpr", "es-data-law"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "es.education-dpo",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Appoint, communicate and publish contact details for a data-protection officer where the operator is an education centre at a level covered by education law.",
    applicabilityExplanation:
      "LOPDGDD Article 34 expressly lists covered education centres; a school-style screen or informal learning centre is insufficient.",
    unknownExplanation:
      "Confirm education level, centre status, operator and DPO designation or group arrangement.",
    expectedEvidence: [
      "DPO appointment, authority notification and published contact details",
    ],
    sourceIds: ["es-data-law", "es-education-law"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the operator is outside Article 34's education-centre category and verify uncertain scope with the Spanish data-protection authority.",
  }),
  action({
    id: "es.dpia-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether the site's child, health or monitoring data processing triggers a GDPR data-protection impact assessment.",
    applicabilityExplanation:
      "A DPIA is conditional on high-risk processing, not on the portal sector alone.",
    unknownExplanation:
      "Confirm processing scale, sensitivity, monitoring and risk to individuals.",
    expectedEvidence: [
      "Documented DPIA screening and assessment where required",
    ],
    sourceIds: ["es-gdpr"],
    signalKeys: ["medical"],
  }),
  action({
    id: "es.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess work risks, plan preventive measures and provide role-appropriate worker information and training.",
    applicabilityExplanation:
      "Law 31/1995 follows actual employer activity rather than institutional sector.",
    unknownExplanation: "Confirm employer, work sites, staff roles and risks.",
    expectedEvidence: [
      "Work-risk assessment, preventive plan and staff information/training records",
    ],
    sourceIds: ["es-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "es.premises-fire",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Review site fire precautions, evacuation and accessibility against its actual building use and competent local authority decisions.",
    applicabilityExplanation:
      "Building-code and self-protection triggers depend on use, capacity, works and regional rules; controlling premises alone does not set each threshold.",
    unknownExplanation:
      "Confirm building use, occupancy, works, fire assessment and municipal requirements.",
    expectedEvidence: [
      "Fire assessment, evacuation plan where required and local authority decisions",
    ],
    sourceIds: ["es-building-code"],
    signalKeys: [],
  }),
  action({
    id: "es.school-programme",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Deliver the authorised education levels and apply the applicable curriculum, attendance, assessment, inclusion and family-information rules.",
    applicabilityExplanation:
      "National education law supplies a framework; the autonomous community sets material curriculum and operating detail for the actual level.",
    unknownExplanation:
      "Confirm education level, authorised programme, ages and autonomous-community rules.",
    expectedEvidence: [
      "Authorised programme, attendance and assessment records, inclusion plan and family information",
    ],
    sourceIds: ["es-education-law", "es-school-minimums"],
    signalKeys: ["attendance", "agreements"],
  }),
  action({
    id: "es.early-education",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: earlyYears,
    action:
      "Check the approved early-years programme, staffing, premises, group size and family-information rules for the site's actual provision and autonomous community.",
    applicabilityExplanation:
      "Royal Decree 95/2022 is a national framework; first-cycle criteria and local implementation must be checked separately.",
    unknownExplanation:
      "Confirm ages, actual education or care route, approved site, staffing and regional rules.",
    expectedEvidence: [
      "Programme and authorisation, staffing and premises evidence, family information",
    ],
    sourceIds: ["es-early-curriculum", "es-education-law"],
    signalKeys: ["attendance", "personnel", "agreements"],
  }),
  action({
    id: "es.food-activity",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For an actual food business, confirm the competent registration route and maintain hygiene and HACCP-based controls.",
    applicabilityExplanation:
      "EU food hygiene law follows food-business activity; school meal rules apply only to relevant school meal provision.",
    unknownExplanation:
      "Confirm food operator, kitchen or caterer, handling pattern and regional registration requirements.",
    expectedEvidence: [
      "Registration or exception assessment, hygiene procedures and inspection records",
    ],
    sourceIds: ["es-food-hygiene", "es-school-food"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered food business is operated and check doubtful activity scope with the competent food authority.",
  }),
  action({
    id: "es.trips-and-events",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan trips with role-appropriate supervision, emergency contacts and family permissions; check destination, transport and residential rules separately.",
    applicabilityExplanation:
      "A trip flag does not establish transport licensing or all local authorisations.",
    unknownExplanation:
      "Confirm ages, destination, duration, transport, accommodation and organiser.",
    expectedEvidence: [
      "Trip risk assessment, supervision plan and permissions",
    ],
    sourceIds: ["es-child-protection"],
    signalKeys: ["trips"],
  }),
  action({
    id: "es.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "For actual ICCE provision, maintain provider registration, learner enrolments, approved academic projections and moderation evidence.",
    applicabilityExplanation:
      "ICCE participation is a separate provider relationship; it grants no Spanish school authorisation or qualification recognition.",
    unknownExplanation:
      "Confirm active ICCE agreement, learner enrolments and moderation cycle.",
    expectedEvidence: [
      "ICCE registration, enrolment and projection records, moderation decisions",
    ],
    sourceIds: [
      "es-icce-registration",
      "es-icce-enrolment",
      "es-icce-moderation",
    ],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no ICCE qualifications are offered; the ACE screen alone is not proof of participation.",
  }),
];
