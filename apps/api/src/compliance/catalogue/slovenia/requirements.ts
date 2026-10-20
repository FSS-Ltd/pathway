import type { CatalogueRequirement } from "../schema";
import {
  children,
  earlyYears,
  school,
  sloveniaRegionCodes,
  sloveniaRequirement as action,
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

export const sloveniaRequirements: CatalogueRequirement[] = [
  action({
    id: "si.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the legal operator, actual education or childcare category, programme, registered site and competent authority before relying on the portal sector.",
    applicabilityExplanation:
      "An ACE, Church, Charity or Learning Centre screen does not establish Slovenian school status, public funding or childcare registration.",
    unknownExplanation:
      "Confirm operator, ages, provision pattern, programme, site and municipality.",
    expectedEvidence: [
      "Operator and provider-category assessment, site details and authority correspondence",
    ],
    sourceIds: ["si-education-act", "si-kindergarten-act"],
    signalKeys: [],
  }),
  action({
    id: "si.education-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "For an actual provider of a publicly valid school programme, verify the ministry register entry, approved programme, premises and professional-staff conditions.",
    applicabilityExplanation:
      "ZOFVI and the government register route concern actual education provision; a private school is not automatically a public school or publicly funded.",
    unknownExplanation:
      "Confirm school status, programme validity, register entry, founder, site and any concession or funding decision.",
    expectedEvidence: [
      "Current ministry register decision, approved programme and site/staff evidence",
    ],
    sourceIds: ["si-education-act", "si-education-register"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual provision is outside the publicly valid school route and check borderline cases with the Ministry of Education and the municipality.",
  }),
  ...sloveniaRegionCodes.map((jurisdiction) =>
    action({
      id: `si.regional-school-route-${jurisdiction}`,
      jurisdiction,
      topic: "registration_governance",
      obligationClass: "RECOMMENDATION",
      condition: school,
      action:
        "Confirm the municipality and competent ministry or school inspectorate for this school's site, programme and local decisions.",
      applicabilityExplanation:
        "The NUTS 3 statistical region identifies territory only; it does not establish a school permission or resolve municipal rules.",
      unknownExplanation:
        "Confirm municipality, provider category, site and authority decisions.",
      expectedEvidence: [
        "Municipality and site record, ministry or inspectorate correspondence and applicable decisions",
      ],
      sourceIds: ["si-nuts", "si-education-register"],
      signalKeys: [],
    }),
  ),
  action({
    id: "si.preschool-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    action:
      "Determine and document the actual kindergarten, private educator or home childcare route and secure the corresponding register decision before operating.",
    applicabilityExplanation:
      "The Kindergarten Act distinguishes kindergarten provision and registered home care; the Nursery screen alone does not select a route.",
    unknownExplanation:
      "Confirm ages, premises, care pattern, operator and whether a publicly valid preschool programme is delivered.",
    expectedEvidence: [
      "Applicable register decision, programme and premises evidence",
    ],
    sourceIds: [
      "si-kindergarten-act",
      "si-home-childcare",
      "si-education-register",
    ],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the service is outside Slovenian preschool education or childcare and confirm uncertain classification with the ministry or municipality.",
  }),
  action({
    id: "si.child-protection-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Maintain a restricted procedure for reporting suspected violence or child endangerment to the competent social-work centre or other authority under the applicable route.",
    applicabilityExplanation:
      "ZPND Article 6 and the Family Code include reporting duties with different triggers and covered bodies; case details belong in restricted safeguarding records.",
    unknownExplanation:
      "Confirm actual child-facing work, the nature of the concern and the competent local centre for social work.",
    expectedEvidence: [
      "Restricted referral procedure, local contacts, staff briefing and case audit trail",
    ],
    sourceIds: ["si-child-protection", "si-family-code"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "si.school-violence-protocol",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Check and implement the current school-specific procedures for suspected family, peer and sexual violence, including trained responsible staff.",
    applicabilityExplanation:
      "The ministry's school protocols and family-violence regulation concern actual education institutions; a club or parent portal account is not itself a school.",
    unknownExplanation:
      "Confirm registered school programme, staff roles and the current ministry protocol.",
    expectedEvidence: [
      "School safeguarding procedure, staff training and restricted incident records",
    ],
    sourceIds: ["si-school-protocol", "si-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "si.education-staff-conditions",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "For covered education roles, verify the required qualification, professional examination, language and integrity conditions before appointment.",
    applicabilityExplanation:
      "ZOFVI conditions apply to defined professional roles; they do not justify checking every adult or parent account.",
    unknownExplanation:
      "Confirm each position, programme, qualification route and permitted criminal-record evidence.",
    expectedEvidence: [
      "Role matrix, qualification and examination evidence, permitted integrity-verification metadata",
    ],
    sourceIds: [
      "si-education-act",
      "si-professional-staff",
      "si-criminal-record",
    ],
    signalKeys: ["personnel"],
  }),
  action({
    id: "si.other-child-facing-roles",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess training, supervision and any lawful screening route separately for non-teaching employees and volunteers who work with children.",
    applicabilityExplanation:
      "A teacher's statutory conditions cannot be applied wholesale to clubs, volunteers or ordinary portal users.",
    unknownExplanation:
      "Confirm role, contact with children, organisation type and applicable authority rules.",
    expectedEvidence: [
      "Role assessment, screening decision, training and review records",
    ],
    sourceIds: ["si-criminal-record", "si-child-protection"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "si.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful processing, child and health-data safeguards, privacy information, retention, rights handling, processors, access control and breach response.",
    applicabilityExplanation:
      "GDPR and ZVOP-2 follow actual controller processing; portal evidence does not establish a lawful basis or permit wider medical access.",
    unknownExplanation:
      "Confirm controller role, purposes, special-category data, recipients and retention.",
    expectedEvidence: [
      "Processing record, notices, retention schedule, processor terms and breach procedure",
    ],
    sourceIds: ["si-gdpr", "si-data-law"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "si.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing requires a DPIA and whether the operator must appoint a data-protection officer.",
    applicabilityExplanation:
      "GDPR DPIA and DPO triggers are conditional; neither a school label nor portal use alone decides them.",
    unknownExplanation:
      "Confirm public-body status, scale, systematic monitoring and sensitive child-data processing.",
    expectedEvidence: [
      "DPIA screening or assessment and documented DPO decision",
    ],
    sourceIds: ["si-gdpr", "si-data-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and verify doubtful DPIA or DPO scope with the Information Commissioner.",
  }),
  action({
    id: "si.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Prepare and maintain the written safety statement with work-risk assessment, preventive measures and worker information or training.",
    applicabilityExplanation:
      "ZVZD-1 follows actual employer activity rather than the selected institutional sector.",
    unknownExplanation: "Confirm employer, staff roles, workplaces and risks.",
    expectedEvidence: [
      "Written safety statement, risk assessment, measures and training records",
    ],
    sourceIds: ["si-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "si.fire-and-evacuation",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Review fire precautions, accessible escape routes and whether the building requires a formal evacuation plan and exercise.",
    applicabilityExplanation:
      "Formal plan and training triggers depend on building use and occupancy; controlling a site does not by itself establish every threshold.",
    unknownExplanation:
      "Confirm premises controller, use class, occupancy and local fire-authority requirements.",
    expectedEvidence: [
      "Fire assessment, escape plan, exercise record where required and authority correspondence",
    ],
    sourceIds: ["si-fire"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why a formal plan or exercise does not apply and check uncertain building scope with the competent fire authority.",
  }),
  action({
    id: "si.school-operation",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Run the actual registered school within its approved programme and site, and apply level-specific enrolment, attendance, assessment and recordkeeping rules.",
    applicabilityExplanation:
      "ZOFVI applies to registered education provision; the Primary School Act adds requirements only for actual basic-school provision. ACE participation or school-style screens do not create Slovenian school status.",
    unknownExplanation:
      "Confirm education level, programme, registered site, ages and current ministry rules.",
    expectedEvidence: [
      "Approved programme, enrolment and attendance records, assessments and school documents",
    ],
    sourceIds: ["si-primary-school-act", "si-education-act"],
    signalKeys: ["attendance", "agreements"],
  }),
  action({
    id: "si.preschool-operation",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: earlyYears,
    action:
      "Apply the programme, staffing, group-size, premises and parent-information rules of the site's actual kindergarten or home-care route.",
    applicabilityExplanation:
      "Kindergarten and home-care providers have distinct routes; neither follows automatically from the Nursery screen.",
    unknownExplanation:
      "Confirm ages, registered route, programme, capacity, premises and municipality.",
    expectedEvidence: [
      "Provider approval, programme, staffing and capacity plan, family information",
    ],
    sourceIds: ["si-kindergarten-act", "si-home-childcare"],
    signalKeys: ["attendance", "personnel", "agreements"],
  }),
  action({
    id: "si.food-activity",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For an actual food business, confirm the competent establishment-registration route and maintain food-hygiene and HACCP-based controls.",
    applicabilityExplanation:
      "Regulation 852/2004 follows food-business activity; the Slovenian guidance distinguishes organised activity from occasional school or charity events.",
    unknownExplanation:
      "Confirm food operator, kitchen or caterer, handling pattern and whether an occasional-activity exception applies.",
    expectedEvidence: [
      "Food-establishment registration or exception assessment, hygiene procedures and inspection records",
    ],
    sourceIds: ["si-food-registration", "si-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered food business is operated and confirm doubtful occasional-activity scope with the Food Safety Administration.",
  }),
  action({
    id: "si.trips-and-events",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan trips with role-appropriate supervision, emergency contacts and family permissions, then check any destination, transport or residential rules separately.",
    applicabilityExplanation:
      "A trip flag shows an activity but does not establish transport licensing, camp status or a blanket statutory permission requirement.",
    unknownExplanation:
      "Confirm destination, ages, duration, transport, accommodation and organiser.",
    expectedEvidence: ["Trip assessment, supervision plan and permissions"],
    sourceIds: ["si-child-protection", "si-education-act"],
    signalKeys: ["trips"],
  }),
  action({
    id: "si.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "For actual ICCE provision, maintain provider registration, learner enrolments, approved academic projections and moderation evidence.",
    applicabilityExplanation:
      "ICCE participation is a separate provider relationship; it does not grant Slovenian school or qualification recognition.",
    unknownExplanation:
      "Confirm active ICCE agreement, learner enrolments and moderation cycle.",
    expectedEvidence: [
      "ICCE registration, enrolment and projection records, moderation decisions",
    ],
    sourceIds: [
      "si-icce-registration",
      "si-icce-enrolment",
      "si-icce-moderation",
    ],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no ICCE qualifications are offered; the ACE screen alone is not proof of participation.",
  }),
];
