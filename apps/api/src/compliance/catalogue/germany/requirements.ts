import type { CatalogueRequirement } from "../schema";
import { germanyRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const independentSchool = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const lands: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    "BW",
    "BY",
    "BE",
    "BB",
    "HB",
    "HH",
    "HE",
    "MV",
    "NI",
    "NW",
    "RP",
    "SL",
    "SN",
    "ST",
    "SH",
    "TH",
  ].map((code) => ({
    field: "subdivisionCode",
    op: "eq",
    value: `DE-${code}`,
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
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const germanyRequirements: CatalogueRequirement[] = [
  action({
    id: "deu.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, child-care, youth-welfare and out-of-school provision with the competent Land and local authorities.",
    applicabilityExplanation:
      "A Nexsteps screen, ACE affiliation or public Learning Centre type does not establish Ersatzschule status, public funding or a youth-welfare establishment permit.",
    unknownExplanation:
      "Record ages, hours, curriculum, supervision, care pattern, premises and Land; seek written classification if uncertain.",
    expectedEvidence: [
      "Provision assessment and school authority or Jugendamt correspondence",
    ],
    sourceIds: [
      "deu-private-schools",
      "deu-state-school-laws",
      "deu-youth-permit",
    ],
    signalKeys: [],
  }),
  action({
    id: "deu.private-school-approval",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [independentSchool, lands] },
    action:
      "If the provision is an Ersatzschule, retain the competent Land's approval before operation and confirm its approved scope.",
    applicabilityExplanation:
      "The Basic Law requires approval of private substitute schools, while each Land sets the process. An Ergänzungsschule or tutoring centre may follow a different route.",
    unknownExplanation:
      "Select the operating Land and confirm Ersatzschule versus Ergänzungsschule or non-school status with its school authority.",
    expectedEvidence: [
      "Land school approval, approved ages and school type, authority correspondence",
    ],
    sourceIds: [
      "deu-private-schools",
      "deu-state-school-laws",
      "deu-land-codes",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual service is not an Ersatzschule and verify the alternative route with the Land school authority.",
  }),
  action({
    id: "deu.youth-establishment-permit",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Assess whether the child or youth-care establishment needs a SGB VIII section 45 operating permit and retain it if required.",
    applicabilityExplanation:
      "Section 45 has express exceptions, including some supervised school provision; a childcare flag alone does not resolve whether an establishment is permit-liable.",
    unknownExplanation:
      "Confirm establishment form, operator, ages, care pattern, school oversight and the competent Landesjugendamt's classification.",
    expectedEvidence: [
      "Operating permit or written authority decision explaining the exception",
    ],
    sourceIds: ["deu-youth-permit"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the specific statutory exception or non-establishment basis and confirm uncertain cases with the Landesjugendamt.",
  }),
  action({
    id: "deu.youth-establishment-notifications",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "For a permit-liable establishment, keep required opening, material-change, incident and closure notifications and operating records current.",
    applicabilityExplanation:
      "SGB VIII section 47 applies to permit-liable establishments; it includes immediate notifications and a five-year establishment-record retention floor.",
    unknownExplanation:
      "Confirm permit status, notification events, the authority's forms and the actual record-retention scope.",
    expectedEvidence: [
      "Section 47 notification log, authority receipts and establishment records",
    ],
    sourceIds: ["deu-youth-notifications", "deu-youth-permit"],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the establishment is outside section 47 and confirm the status with the permitting authority.",
  }),
  action({
    id: "deu.child-welfare-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-welfare concern, urgent escalation and Jugendamt contact route suited to the site's actual service.",
    applicabilityExplanation:
      "SGB VIII section 8a prescribes particular risk-assessment and adviser arrangements for youth-welfare providers under agreements; school duties may instead arise from Land rules.",
    unknownExplanation:
      "Confirm provision type, youth-welfare agreements, staff roles and local child-protection contacts.",
    expectedEvidence: [
      "Safeguarding procedure, contact and escalation map, restricted concern record",
    ],
    sourceIds: ["deu-child-protection", "deu-state-school-laws"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "deu.youth-protection-concept",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "For a section 45 establishment, maintain and review the violence-protection, participation and complaints concept required for its permit.",
    applicabilityExplanation:
      "The permit criteria include a protection concept and complaint routes inside and outside the establishment; this action does not turn ordinary tutoring into a licensed facility.",
    unknownExplanation:
      "Confirm permit category, current concept, child participation and Land authority conditions.",
    expectedEvidence: [
      "Protection concept, complaints procedure, participation review and permit correspondence",
    ],
    sourceIds: ["deu-youth-permit", "deu-child-protection"],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no section 45 establishment exists and confirm uncertain classification with the permitting authority.",
  }),
  action({
    id: "deu.role-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Identify child-facing roles needing an extended Führungszeugnis, verify the permitted outcome and record role-based review dates.",
    applicabilityExplanation:
      "SGB VIII sections 45 and 72a and BZRG section 30a depend on actual youth-welfare duties and contact, not on an adult or parent portal account. Certificate data must be minimised.",
    unknownExplanation:
      "Confirm service category, each person's role, legal basis, provider agreement and permitted certificate process.",
    expectedEvidence: [
      "Role assessment, lawful check verification and review record without unnecessary certificate copies",
    ],
    sourceIds: [
      "deu-youth-checks",
      "deu-extended-certificate",
      "deu-youth-permit",
    ],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the role or service is outside the check route and confirm unclear cases with the competent youth-welfare or school authority.",
  }),
  action({
    id: "deu.community-health",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "For a covered community facility, review infection-exclusion, staff instruction and measles-evidence duties for affected children and personnel.",
    applicabilityExplanation:
      "IfSG sections 20, 33 and 34 depend on facility category, age and role; some duties have specific briefing intervals or evidence rules.",
    unknownExplanation:
      "Confirm whether the site is an IfSG section 33 facility, ages, regular child contact and Gesundheitsamt advice.",
    expectedEvidence: [
      "Facility classification, instruction records, restricted health-evidence verification and notification procedure",
    ],
    sourceIds: [
      "deu-community-facilities",
      "deu-infection-duties",
      "deu-measles-proof",
    ],
    signalKeys: ["personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "State why the premises or role falls outside sections 20, 33 and 34 and check uncertain classification with the Gesundheitsamt.",
  }),
  action({
    id: "deu.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding processing and identify controllers and processors.",
    applicabilityExplanation:
      "GDPR obligations follow actual processing; a signed agreement does not itself provide a lawful basis for every purpose.",
    unknownExplanation:
      "Record purposes, recipients, sensitive-data categories, retention and processor roles before deciding which detailed controls apply.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["deu-gdpr", "deu-bdsg"],
    signalKeys: [],
  }),
  action({
    id: "deu.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy notices, sensitive-data conditions, retention, access controls and breach handling for personal data this site controls.",
    applicabilityExplanation:
      "GDPR controller duties apply to actual processing. DPIA, DPO and breach-notification actions need separate trigger assessments; employment data also need BDSG review.",
    unknownExplanation:
      "Confirm controller status, staff data, health data, risk profile and the competent supervisory authority.",
    expectedEvidence: [
      "Lawful-basis record, notices, retention schedule, controls and breach procedure",
    ],
    sourceIds: ["deu-gdpr", "deu-bdsg"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "deu.work-risk-assessment",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess work-related hazards and document the required protective measures for employees.",
    applicabilityExplanation:
      "ArbSchG section 5 applies to employers and actual work activities; premises and child-safety duties may additionally arise under Land or local law.",
    unknownExplanation:
      "Confirm employment arrangements, workplaces, activities and responsible persons.",
    expectedEvidence: [
      "Current hazard assessment and protective-action record",
    ],
    sourceIds: ["deu-work-risk"],
    signalKeys: [],
  }),
  action({
    id: "deu.facility-hygiene-plan",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "For a covered community facility, maintain the infection-hygiene plan and local health-office arrangements.",
    applicabilityExplanation:
      "IfSG section 36 requires hygiene plans for specified section 33 facilities; responsibility at shared premises and Land implementation need confirmation.",
    unknownExplanation:
      "Confirm facility classification, premises control, hygiene responsibilities and Gesundheitsamt requirements.",
    expectedEvidence: [
      "Hygiene plan, premises-responsibility record and health-office correspondence",
    ],
    sourceIds: ["deu-community-facilities", "deu-hygiene-plans"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the facility-category or premises-responsibility basis and verify uncertain exclusions with the Gesundheitsamt.",
  }),
  action({
    id: "deu.land-school-education",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [independentSchool, lands] },
    action:
      "Review the school's approved teaching scope, staff qualifications, assessment and inclusion requirements under the operating Land's law.",
    applicabilityExplanation:
      "The Länder control school law and supervision; national guidance cannot substitute for the specific Land's curriculum, inspection and approval conditions.",
    unknownExplanation:
      "Select the Land and confirm school type, ages, approval, curriculum and authority guidance.",
    expectedEvidence: [
      "Land approval, curriculum mapping, staff qualification and inspection records",
    ],
    sourceIds: [
      "deu-private-schools",
      "deu-state-school-laws",
      "deu-land-codes",
    ],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the provision is not a Land-regulated private school and confirm uncertain status with the school authority.",
  }),
  action({
    id: "deu.daycare-quality",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "For a daycare establishment, align the pedagogical concept, parent participation, inclusion and staffing with its permit and Land rules.",
    applicabilityExplanation:
      "SGB VIII section 22a describes daycare quality and participation; actual staffing ratios and operation conditions are Land and permit specific.",
    unknownExplanation:
      "Confirm daycare classification, permit, Land, approved ages, staffing and local Jugendamt conditions.",
    expectedEvidence: [
      "Pedagogical concept, permit conditions, staffing and parent-participation review",
    ],
    sourceIds: ["deu-daycare-quality", "deu-youth-permit"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual service is not a daycare establishment and check uncertain classification with the Jugendamt.",
  }),
  action({
    id: "deu.food-service",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: food,
    action:
      "For food-business activity, maintain appropriate hygiene controls and identify staff needing IfSG section 43 instruction.",
    applicabilityExplanation:
      "EU food-hygiene rules and German food-handler instruction depend on the actual preparation and serving activity; occasional events may have a different route.",
    unknownExplanation:
      "Confirm food activity, operator, regularity, staff tasks and the competent food-control authority.",
    expectedEvidence: [
      "Food-activity classification, hygiene procedures, training and relevant instruction records",
    ],
    sourceIds: ["deu-food-hygiene", "deu-food-staff"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the food activity is outside the regulated route and verify uncertain cases with local food control or the Gesundheitsamt.",
  }),
  action({
    id: "deu.trips-classification",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Check whether organised trips, camps or overnight stays change youth-welfare permit, supervision or community-facility duties.",
    applicabilityExplanation:
      "SGB VIII section 45 has exceptions for some youth hostels and school camps, while IfSG section 33 includes certain camps; parent permission is not regulatory approval.",
    unknownExplanation:
      "Record activity pattern, ages, accommodation, responsible operator and local authority classification.",
    expectedEvidence: [
      "Trip and accommodation risk review, authority decision and parent permissions",
    ],
    sourceIds: ["deu-youth-permit", "deu-community-facilities"],
    signalKeys: ["trips"],
  }),
  action({
    id: "deu.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal for qualifications actually offered.",
    applicabilityExplanation:
      "ICCE requirements apply only to participating providers; ACE branding and German school approval do not establish ICCE participation or recognition of qualifications.",
    unknownExplanation:
      "Confirm whether ICCE qualifications are offered and whether Land recognition is relevant.",
    expectedEvidence: ["Current ICCE registration and renewal correspondence"],
    sourceIds: ["deu-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "deu.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Check ICCE student enrolment, approved academic projections and moderation for qualifications actually offered.",
    applicabilityExplanation:
      "These are provider requirements for actual ICCE participants, separate from Land education authorisation.",
    unknownExplanation:
      "Confirm participating students, level, projections and moderation cycle.",
    expectedEvidence: ["Enrolment, approved projection and moderation records"],
    sourceIds: ["deu-icce-enrolment", "deu-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
