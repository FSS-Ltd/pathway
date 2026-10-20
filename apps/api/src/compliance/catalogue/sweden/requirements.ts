import type { CatalogueRequirement } from "../schema";
import {
  children,
  earlyYears,
  school,
  swedenCountyCodes,
  swedenRequirement as action,
} from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const independentSchool = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const coveredEducation: NonNullable<CatalogueRequirement["condition"]> = {
  any: [school, earlyYears],
};
const food: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "foodBusiness", op: "eq", value: true },
    { field: "food", op: "eq", value: true },
  ],
};

export const swedenRequirements: CatalogueRequirement[] = [
  action({
    id: "se.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the legal operator, actual school, preschool, pedagogical-care or out-of-school category, ages, provision pattern, school unit and competent municipality.",
    applicabilityExplanation:
      "ACE, funding and portal screen choice do not establish Swedish independent-school or municipal-school status.",
    unknownExplanation:
      "Confirm operator, provider category, ages, programme, site and municipality.",
    expectedEvidence: [
      "Operator and provider-category assessment, site details and authority correspondence",
    ],
    sourceIds: ["se-education-law", "se-preschool-care"],
    signalKeys: [],
  }),
  action({
    id: "se.independent-school-approval",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Verify Swedish Schools Inspectorate approval for the actual independent-school operator, education and school unit before operating or expanding.",
    applicabilityExplanation:
      "Education Act Chapter 2 Section 5 and the Inspectorate's route concern actual independent schools, not out-of-school learning centres or municipal schools.",
    unknownExplanation:
      "Confirm school form, approved operator, unit, municipality, grades and any expansion decision.",
    expectedEvidence: [
      "Current operator approval, school-unit details and expansion decisions",
    ],
    sourceIds: ["se-education-law", "se-school-approval"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the provision is outside independent-school approval and check borderline cases with the Schools Inspectorate or municipality.",
  }),
  action({
    id: "se.early-years-approval",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: earlyYears,
    action:
      "Determine whether the site is an independent preschool, recreation centre or pedagogical-care provider and obtain the corresponding municipal approval where required.",
    applicabilityExplanation:
      "The municipality has the approval route for independent preschools and certain other provision; the Nursery screen alone does not select it.",
    unknownExplanation:
      "Confirm ages, hours, school form, premises, municipality and whether the service is pedagogical care.",
    expectedEvidence: [
      "Provider classification, municipal approval or written route decision",
    ],
    sourceIds: [
      "se-education-law",
      "se-preschool-approval",
      "se-preschool-care",
    ],
    signalKeys: ["attendance"],
  }),
  ...swedenCountyCodes.map((jurisdiction) =>
    action({
      id: `se.local-authority-${jurisdiction}`,
      jurisdiction,
      topic: "registration_governance",
      obligationClass: "RECOMMENDATION",
      condition: null,
      action:
        "Identify the site's municipality and confirm local approval, supervision, food-registration and fire-authority decisions for its actual provision.",
      applicabilityExplanation:
        "The NUTS 3 county is a territorial selector, not a substitute for one of Sweden's municipalities or its decisions.",
      unknownExplanation:
        "Confirm municipality, provider category, premises and actual activities.",
      expectedEvidence: [
        "Municipality record, applicable authority correspondence and site decisions",
      ],
      sourceIds: ["se-nuts", "se-education-law"],
      signalKeys: [],
    }),
  ),
  action({
    id: "se.legal-form",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the operator's actual legal form and retain its governing documents and any applicable organisation-number or religious-community registration evidence.",
    applicabilityExplanation:
      "A Church or Charity portal sector does not prove registration as a religious community or association; a non-profit association need not universally register to have legal capacity.",
    unknownExplanation:
      "Confirm operator legal form, governing body and any applicable register or organisation number.",
    expectedEvidence: [
      "Governing documents, representatives and applicable registration or organisation-number evidence",
    ],
    sourceIds: ["se-association", "se-religious-entity"],
    signalKeys: [],
  }),
  action({
    id: "se.covered-child-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: coveredEducation,
    action:
      "For a covered education or pedagogical-care service, maintain a procedure for immediate notification to the social welfare committee when staff know or suspect a child is being harmed.",
    applicabilityExplanation:
      "Social Services Act (2025:400) Chapter 19 Section 1 covers people active under the Education Act and other listed services; it does not make every club or adult account a mandated reporter.",
    unknownExplanation:
      "Confirm the actual service's Education Act status, each role and the competent municipality's social welfare committee.",
    expectedEvidence: [
      "Restricted reporting procedure, local contact, staff briefing and case audit trail",
    ],
    sourceIds: ["se-social-services", "se-education-law"],
    signalKeys: ["safeguarding", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the service is outside the Education Act route and separately assess whether another Chapter 19 Section 1 category, including professionally run private child services, applies.",
  }),
  action({
    id: "se.other-child-reporting",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess whether a non-school service falls within a mandatory Chapter 19 Section 1 reporting category, and make the local concern-reporting route clear to all child-facing adults.",
    applicabilityExplanation:
      "Section 1 can also cover professionally run private services involving children; Section 4 encourages everyone else to report. The portal lacks facts to decide this automatically.",
    unknownExplanation:
      "Confirm the operator's professional service category, child-facing activities and competent local social-services contact.",
    expectedEvidence: [
      "Documented Section 1 category assessment, safeguarding procedure, local contacts and role briefing",
    ],
    sourceIds: ["se-social-services"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "se.education-protection",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: coveredEducation,
    action:
      "Maintain the Education Act route for preventing, reporting, investigating and addressing degrading treatment of children or pupils.",
    applicabilityExplanation:
      "Education Act Chapter 6 applies to covered school and preschool activity; independent clubs require their own separately assessed safeguarding route.",
    unknownExplanation:
      "Confirm actual school or preschool form, responsible head, staff escalation and applicable municipality.",
    expectedEvidence: [
      "Annual prevention plan where required, reporting process, restricted case records and follow-up",
    ],
    sourceIds: ["se-education-law", "se-school-protection"],
    signalKeys: ["safeguarding", "agreements"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual service is outside Education Act Chapter 6 and confirm doubtful classification with the municipality or Schools Inspectorate.",
  }),
  action({
    id: "se.education-register-check",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: coveredEducation,
    action:
      "For roles covered by Education Act Chapter 2 Sections 31–33, inspect a qualifying register extract at the appointment or placement stage and record only that it was shown.",
    applicabilityExplanation:
      "The extract must be no more than six months old when presented. The covered-role and reappointment rules differ from checks for non-school associations; an adult portal account alone is not a trigger.",
    unknownExplanation:
      "Confirm the role, school or pedagogical-care route, appointment date and any statutory exception.",
    expectedEvidence: [
      "Role matrix and permitted note that a qualifying extract was presented; do not retain the extract in this checklist",
    ],
    sourceIds: ["se-education-law", "se-school-register"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no covered appointment or placement occurred and verify doubtful role scope with the school authority.",
  }),
  action({
    id: "se.other-child-roles",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess supervision, training and the lawful non-school register-extract route separately for child-facing employees and volunteers outside education.",
    applicabilityExplanation:
      "Swedish Police distinguishes child work outside school; the organiser may request a relevant extract for an offered role, but this is not a blanket requirement for parents.",
    unknownExplanation:
      "Confirm role, child contact, activity and lawful screening basis.",
    expectedEvidence: [
      "Role assessment, permitted verification metadata, training and review dates",
    ],
    sourceIds: ["se-other-register", "se-social-services"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "se.teacher-qualification",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Verify teacher certification, eligibility and role-specific exceptions for each teaching appointment.",
    applicabilityExplanation:
      "Qualification rules follow school form, subject and role; a school label does not make every staff member a teacher.",
    unknownExplanation:
      "Confirm teaching role, school form, subject, certification and any exception.",
    expectedEvidence: [
      "Teacher-role matrix, certification or permitted exception and review date",
    ],
    sourceIds: ["se-education-law", "se-school-qualification"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "se.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful processing, child and health-data safeguards, privacy information, retention, rights handling, processors, access control and breach response.",
    applicabilityExplanation:
      "GDPR follows the actual controller and processing; child and medical records need restricted access.",
    unknownExplanation:
      "Confirm controller role, purposes, sensitive data, recipients and retention.",
    expectedEvidence: [
      "Processing record, notices, retention schedule, processor terms and breach procedure",
    ],
    sourceIds: ["se-gdpr", "se-school-privacy"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "se.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing requires a DPIA and whether the operator must appoint a data-protection officer.",
    applicabilityExplanation:
      "GDPR triggers depend on processing and public-body status; a portal sector or school-style screen alone does not decide them.",
    unknownExplanation:
      "Confirm public-body status, scale, monitoring and special-category child data.",
    expectedEvidence: [
      "DPIA screening or assessment and documented DPO decision",
    ],
    sourceIds: ["se-gdpr", "se-dpo"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and check uncertain DPIA or DPO scope with the Swedish privacy authority.",
  }),
  action({
    id: "se.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Document work-risk assessment, prevention measures, role responsibilities, worker information and review under systematic work-environment management.",
    applicabilityExplanation:
      "Employer duties follow actual employment, not the institutional sector or funding label.",
    unknownExplanation: "Confirm employer, staff roles, workplaces and risks.",
    expectedEvidence: [
      "Written risk assessment, action plan, staff information and review records",
    ],
    sourceIds: ["se-work-risk"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "se.fire-precautions",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: premises,
    action:
      "For premises the operator owns or uses, maintain reasonable fire-prevention, extinguishing and life-safety measures for the actual building and activity.",
    applicabilityExplanation:
      "Civil Protection Act Chapter 2 Section 2 follows ownership or right of use; detailed measures depend on building risk and municipal fire oversight.",
    unknownExplanation:
      "Confirm ownership or use, building layout, occupancy and local fire-authority requirements.",
    expectedEvidence: [
      "Fire assessment, equipment and evacuation arrangements, maintenance and authority correspondence",
    ],
    sourceIds: ["se-fire-law"],
    signalKeys: [],
  }),
  action({
    id: "se.school-programme",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Deliver the approved school form with its applicable curriculum, attendance, support, student-health and systematic quality requirements.",
    applicabilityExplanation:
      "The Education Act and school-form curriculum apply to actual schools; the exact level and specialist provision need separate review.",
    unknownExplanation:
      "Confirm school form, grade range, curriculum, pupil ages and approved school unit.",
    expectedEvidence: [
      "Approved school programme, curriculum plan, attendance, support, student-health and quality records",
    ],
    sourceIds: ["se-education-law", "se-school-curriculum"],
    signalKeys: ["attendance", "medical", "agreements"],
  }),
  action({
    id: "se.preschool-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: earlyYears,
    action:
      "Apply the education or pedagogical-care programme, staffing, child-group, support and family-information rules of the site's actual approved route.",
    applicabilityExplanation:
      "Preschool and pedagogical care are different routes; the nursery screen does not identify the applicable curriculum or municipal conditions.",
    unknownExplanation:
      "Confirm ages, provider approval, site, hours, group size and municipality.",
    expectedEvidence: [
      "Approval, curriculum or care plan, staffing and family information",
    ],
    sourceIds: [
      "se-education-law",
      "se-preschool-curriculum",
      "se-preschool-care",
    ],
    signalKeys: ["attendance", "personnel", "agreements"],
  }),
  action({
    id: "se.food-activity",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For an actual food business, confirm municipal establishment registration and maintain hygiene and HACCP-based controls.",
    applicabilityExplanation:
      "EU food hygiene and Swedish registration follow the actual operator and food activity; occasional activity may require a separate classification decision.",
    unknownExplanation:
      "Confirm food operator, preparation or catering pattern, site and municipality.",
    expectedEvidence: [
      "Municipal registration or exception assessment, hygiene procedures and inspection records",
    ],
    sourceIds: ["se-food-registration", "se-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered food business is operated and check doubtful occasional-activity scope with the municipality.",
  }),
  action({
    id: "se.trips-and-events",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan trips with role-appropriate supervision, emergency contacts and family permissions, then check transport, destination and overnight rules separately.",
    applicabilityExplanation:
      "A trip flag does not establish vehicle licensing, residential-care status or a blanket statutory consent requirement.",
    unknownExplanation:
      "Confirm ages, destination, duration, transport, accommodation and organiser.",
    expectedEvidence: [
      "Trip risk assessment, supervision plan and permissions",
    ],
    sourceIds: ["se-education-law", "se-social-services"],
    signalKeys: ["trips"],
  }),
  action({
    id: "se.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "For actual ICCE provision, maintain provider registration, learner enrolments, approved academic projections and moderation evidence.",
    applicabilityExplanation:
      "ICCE participation is a separate provider relationship; it grants no Swedish school approval or qualification recognition.",
    unknownExplanation:
      "Confirm active ICCE agreement, learner enrolments and moderation cycle.",
    expectedEvidence: [
      "ICCE registration, enrolment and projection records, moderation decisions",
    ],
    sourceIds: [
      "se-icce-registration",
      "se-icce-enrolment",
      "se-icce-moderation",
    ],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no ICCE qualifications are offered; ACE screen choice alone is not proof of participation.",
  }),
];
