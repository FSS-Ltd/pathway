import type { CatalogueRequirement } from "../schema";
import {
  children,
  earlyYears,
  school,
  slovakiaRegionCodes,
  slovakiaRequirement as action,
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

export const slovakiaRequirements: CatalogueRequirement[] = [
  action({
    id: "sk.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the actual legal operator, school or childcare status, registered site and competent authority before relying on the portal sector.",
    applicabilityExplanation:
      "ACE, Church, Charity and Learning Centre screens do not establish Slovak school registration, public-provider status or childcare authorisation.",
    unknownExplanation:
      "Confirm legal operator, ages, provision pattern, site and competent ministry, regional or local authority.",
    expectedEvidence: [
      "Operator and provider-category record, site address and authority correspondence",
    ],
    sourceIds: ["sk-school-administration", "sk-social-services"],
    signalKeys: [],
  }),
  action({
    id: "sk.school-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "For an actual school or school facility, verify its current entry, founder, approved site and educational scope in the school register under the 2026 school-administration law.",
    applicabilityExplanation:
      "Law 321/2025 replaced the earlier school-network framework from 1 January 2026. A private or church school is not automatically a public provider; the separate public-provider route has transitional timing.",
    unknownExplanation:
      "Confirm legal school status, founder, register entry, programme, site and any public-provider decision.",
    expectedEvidence: [
      "Current school-register entry, founder documents and approved scope",
    ],
    sourceIds: ["sk-school-administration", "sk-school-act"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual provision is outside the school register and verify a borderline case with the Ministry of Education or competent regional school authority.",
  }),
  ...slovakiaRegionCodes.map((jurisdiction) =>
    action({
      id: `sk.regional-school-route-${jurisdiction}`,
      jurisdiction,
      topic: "registration_governance",
      obligationClass: "RECOMMENDATION",
      condition: school,
      action:
        "Confirm the competent regional school office and municipality for the school's current registration, notifications and local decisions.",
      applicabilityExplanation:
        "The Eurostat kraj code identifies territory, not an operating permission or a completed local-authority review.",
      unknownExplanation:
        "Confirm municipality, school site, founder and competent regional school office.",
      expectedEvidence: [
        "Site and municipality, regional office correspondence and applicable decisions",
      ],
      sourceIds: ["sk-nuts", "sk-school-administration"],
      signalKeys: [],
    }),
  ),
  action({
    id: "sk.under-three-care-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: {
      all: [earlyYears, { field: "minimumAge", op: "lte", value: 2 }],
    },
    action:
      "For actual care of children under three, determine whether the social-services facility route or another childcare route applies and verify registration and capacity with the competent authority.",
    applicabilityExplanation:
      "Law 448/2008 describes a particular under-three social service; a Nursery screen alone does not prove that category or licence.",
    unknownExplanation:
      "Confirm children's ages, care purpose, opening pattern, operator, room capacity and authority decision.",
    expectedEvidence: [
      "Provider-category assessment, registration or authority decision and approved capacity",
    ],
    sourceIds: ["sk-social-services", "sk-public-health"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the site is outside regulated under-three care and confirm uncertain classification with the competent regional social-services or public-health authority.",
  }),
  action({
    id: "sk.child-protection-notification",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Maintain a restricted procedure so child-facing people can notify the child social protection authority of violations of a child's rights under Section 7.",
    applicabilityExplanation:
      "The notification duty is about a child-rights violation, not a generic portal account; case details must stay in the restricted safeguarding workflow.",
    unknownExplanation:
      "Confirm actual child-facing roles and the competent local child social protection authority and emergency route.",
    expectedEvidence: [
      "Restricted referral procedure, authority contacts, staff briefing and case audit trail",
    ],
    sourceIds: ["sk-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "sk.pedagogical-staff-integrity",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "For covered pedagogical and professional staff, verify statutory qualifications and the current integrity decision through the competent regional school authority.",
    applicabilityExplanation:
      "Law 138/2019 applies to defined staff roles. Since 2026 the relevant child-and-youth criminal-register extract route differs from the pre-2026 record; an ordinary adult or parent account is not a staff role.",
    unknownExplanation:
      "Confirm each staff category, employer, qualification, nationality and applicable document route.",
    expectedEvidence: [
      "Role and qualification assessment, permitted verification metadata and authority decision",
    ],
    sourceIds: ["sk-pedagogical-staff"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "sk.other-child-facing-roles",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess training, supervision and any legally required checks for each non-pedagogical employee or volunteer role before engagement.",
    applicabilityExplanation:
      "The pedagogical-staff check cannot be applied wholesale to clubs, volunteers or ordinary portal users; each actual role needs its own legal route.",
    unknownExplanation:
      "Confirm role, contact with children, employer or volunteer arrangement and relevant authority rules.",
    expectedEvidence: [
      "Role matrix, screening decision, training record and review dates",
    ],
    sourceIds: ["sk-child-protection", "sk-pedagogical-staff"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "sk.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, privacy information, retention, rights handling, processors, access control and breach response.",
    applicabilityExplanation:
      "GDPR and Slovak data-protection duties follow actual controller processing; portal evidence cannot establish lawful basis or justify wider medical access.",
    unknownExplanation:
      "Confirm controller role, processing purposes, special-category data, recipients and retention.",
    expectedEvidence: [
      "Processing register, notices, retention schedule, processor terms and breach procedure",
    ],
    sourceIds: ["sk-gdpr", "sk-data-law"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "sk.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing requires a DPIA and whether the operator must appoint a data-protection officer.",
    applicabilityExplanation:
      "GDPR DPIA and DPO triggers are conditional; a school label or portal use does not decide them.",
    unknownExplanation:
      "Confirm public-body status, scale, systematic monitoring and sensitive child-data processing.",
    expectedEvidence: [
      "DPIA screening or assessment and documented DPO decision",
    ],
    sourceIds: ["sk-gdpr", "sk-data-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and check uncertain high-risk or DPO scope with the Slovak data-protection authority.",
  }),
  action({
    id: "sk.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess work risks and record preventive measures, worker information and safety training for actual employees and workplaces.",
    applicabilityExplanation:
      "Law 124/2006 follows employer and workplace activity rather than selected portal sector.",
    unknownExplanation: "Confirm employer, staff roles, workplaces and risks.",
    expectedEvidence: [
      "Risk assessment, prevention measures and training records",
    ],
    sourceIds: ["sk-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "sk.fire-and-health",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check fire-protection and child-facility public-health duties against the site's actual use, capacity and operator.",
    applicabilityExplanation:
      "Fire training and health requirements depend on legal person, building use and whether the facility serves children or youth; a sector label is insufficient.",
    unknownExplanation:
      "Confirm premises controller, age groups, use class, occupancy and regional public-health decisions.",
    expectedEvidence: [
      "Fire assessment, evacuation arrangements, health operating rules and authority correspondence",
    ],
    sourceIds: ["sk-fire", "sk-public-health"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no relevant site duty applies and confirm uncertain fire or public-health scope with the competent district fire authority or regional public-health office.",
  }),
  action({
    id: "sk.school-operation",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Operate the actual registered school to its approved programme and current School Act requirements for education, attendance and documentation.",
    applicabilityExplanation:
      "The School Act applies to actual school provision; neither ACE participation nor a school-style screen creates Slovak school or public funding status.",
    unknownExplanation:
      "Confirm school category, registered site, ages, programme and current ministry rules.",
    expectedEvidence: [
      "Approved programme, school documents, attendance and assessment records",
    ],
    sourceIds: ["sk-school-act", "sk-school-administration"],
    signalKeys: ["attendance", "agreements"],
  }),
  action({
    id: "sk.early-childhood-operation",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: earlyYears,
    action:
      "Apply the operating, staffing, capacity and parent-information duties for the site's actual preschool, under-three social-service or other childcare route.",
    applicabilityExplanation:
      "Preschool education and under-three social care are different legal routes; neither can be inferred solely from the Nursery screen.",
    unknownExplanation:
      "Confirm ages, service category, care hours, registered capacity and competent authority decision.",
    expectedEvidence: [
      "Provider approval, operating rules, staff plan and family information",
    ],
    sourceIds: ["sk-school-act", "sk-social-services", "sk-public-health"],
    signalKeys: ["attendance", "personnel", "agreements"],
  }),
  action({
    id: "sk.food-activity",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, verify the competent registration or approval route and implement food-hygiene and HACCP-based controls.",
    applicabilityExplanation:
      "Regulation 852/2004 and Slovak public-health rules follow who prepares, handles or serves food; the school or club label is not an exemption.",
    unknownExplanation:
      "Confirm kitchen, caterer, operator, site, handling and applicable food or public-health authority.",
    expectedEvidence: [
      "Registration or authority decision, hygiene procedures and inspection records",
    ],
    sourceIds: ["sk-food-hygiene", "sk-public-health"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered food business is operated and check doubtful scope with the competent regional public-health or food authority.",
  }),
  action({
    id: "sk.trips-and-residential-events",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan trips with supervision, emergency contacts and family permissions; separately assess whether a residential event qualifies for the public-health event regime.",
    applicabilityExplanation:
      "A day trip is not automatically a regulated residential event; current law includes specific age, group-size and duration conditions.",
    unknownExplanation:
      "Confirm destination, duration, number and ages of children, organiser, food, accommodation and transport.",
    expectedEvidence: [
      "Trip assessment and permissions, plus any event decision or notification",
    ],
    sourceIds: ["sk-public-health", "sk-child-protection"],
    signalKeys: ["trips"],
  }),
  action({
    id: "sk.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "For actual ICCE provision, maintain provider registration, learner enrolments, approved academic projections and moderation evidence.",
    applicabilityExplanation:
      "ICCE participation is a separate provider relationship; it does not grant Slovak school or qualification recognition.",
    unknownExplanation:
      "Confirm active ICCE agreement, learner enrolments and current moderation cycle.",
    expectedEvidence: [
      "ICCE registration, enrolment and projection records, moderation decisions",
    ],
    sourceIds: [
      "sk-icce-registration",
      "sk-icce-enrolment",
      "sk-icce-moderation",
    ],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no ICCE qualifications are offered; the ACE screen alone is not proof of participation.",
  }),
];
