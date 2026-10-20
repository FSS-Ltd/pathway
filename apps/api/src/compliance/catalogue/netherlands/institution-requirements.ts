import type { CatalogueRequirement } from "../schema";
import {
  childCare,
  formalSchool,
  independentSchool,
  municipality,
  netherlandsRequirement as action,
  outOfSchool,
  stateSchool,
} from "./shared";

const icce = { field: "icce", op: "eq", value: true } as const;
const nonFundedSchool: NonNullable<CatalogueRequirement["condition"]> = {
  all: [
    independentSchool,
    { field: "fundingStatus", op: "eq", value: "PRIVATE" },
  ],
};

export const netherlandsInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "nl.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the site's actual funded public or denominational school, non-funded B3/B4 school, LRK childcare, tuition or community provision and confirm the competent route.",
    applicabilityExplanation:
      "Dutch publicly funded denominational schools and non-funded B3/B4 schools have distinct legal routes. ACE, Church and Learning Centre screens do not determine legal status.",
    unknownExplanation:
      "Confirm ages, compulsory-school provision, public funding, curriculum, legal operator, childcare service and municipal or inspectorate decision.",
    expectedEvidence: ["Provider classification and authority correspondence"],
    sourceIds: ["nl-private-types", "nl-public-special", "nl-childcare-start"],
    signalKeys: [],
  }),
  action({
    id: "nl.b3-notification",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: nonFundedSchool,
    action:
      "If the actual non-funded school follows the B3 route, verify DUO notification within four weeks of establishment and the inspectorate or attendance-officer decision.",
    applicabilityExplanation:
      "The B3 route is for qualifying non-funded primary or secondary schools; B4 international/foreign schools and funded denominational schools require separate classification.",
    unknownExplanation:
      "Confirm B3/B4 status, education level, establishment date, DUO notice and inspectorate decision.",
    expectedEvidence: [
      "DUO notice, dated submission, school documents and inspectorate or attendance-officer decision",
    ],
    sourceIds: ["nl-b3-primary", "nl-b3-secondary", "nl-private-types"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the authority-confirmed alternative to B3 and check a borderline school with DUO, the inspectorate or the municipality before skipping notification.",
  }),
  action({
    id: "nl.funded-school-authority",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: stateSchool,
    action:
      "Identify the competent school board, public or denominational status, funding decision and responsible education authority.",
    applicabilityExplanation:
      "A non-ACE Learning Centre is not government funded merely because it reuses State School screens; funded denominational schools are not B3 schools.",
    unknownExplanation:
      "Confirm school board, funding, denomination and registration with DUO or the municipality.",
    expectedEvidence: [
      "Board and funding records, registration and authority correspondence",
    ],
    sourceIds: ["nl-public-special", "nl-private-types"],
    signalKeys: [],
  }),
  action({
    id: "nl.childcare-lrk",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For actual registered childcare, obtain the municipality's decision and LRK entry before operation and keep location and operator details current.",
    applicabilityExplanation:
      "Daycare, BSO and gastouder routes require their own classification; a Nursery or Learning Centre label alone does not establish LRK scope.",
    unknownExplanation:
      "Confirm ages, care pattern, operator, location and whether the service falls under the Wet kinderopvang with the municipality and GGD.",
    expectedEvidence: [
      "Municipal approval, LRK number, GGD report and change notifications",
    ],
    sourceIds: ["nl-childcare-start", "nl-childcare-quality"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain the actual non-LRK provision and verify uncertain childcare classification with the municipality or GGD before dismissing it.",
  }),
  action({
    id: "nl.childcare-complaints",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For an LRK childcare provider, maintain its complaints procedure and required registration with the childcare disputes committee.",
    applicabilityExplanation:
      "The specific disputes-committee and complaints obligations follow actual childcare-provider status.",
    unknownExplanation:
      "Confirm LRK provider category and current complaints registration with the municipality.",
    expectedEvidence: [
      "Complaints procedure and Geschillencommissie registration",
    ],
    sourceIds: ["nl-childcare-start"],
    signalKeys: ["agreements"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the site is outside registered childcare and confirm uncertain cases with the municipality or GGD.",
  }),
  action({
    id: "nl.tuition-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Assess whether the centre provides only supplementary tuition, a qualifying school, childcare, an examination route or regulated further/higher education.",
    applicabilityExplanation:
      "Out-of-school tutoring does not automatically fulfil compulsory schooling or confer B3/B4 recognition or public funding.",
    unknownExplanation:
      "Confirm hours, ages, parental claims, diplomas, examination authority, care arrangements and municipal classification.",
    expectedEvidence: [
      "Programme description and relevant municipal, DUO or inspectorate decision",
    ],
    sourceIds: ["nl-private-types", "nl-b3-primary", "nl-childcare-start"],
    signalKeys: ["attendance", "ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain the actual programme and check any compulsory-school, exam or childcare claim with the competent authority or municipality.",
  }),
  action({
    id: "nl.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Maintain the school programme, admissions, attendance, curriculum, assessment and parent information appropriate to its actual funded, B3 or B4 route.",
    applicabilityExplanation:
      "Inspection and quality requirements differ by school category; ICCE materials do not replace Dutch school recognition.",
    unknownExplanation:
      "Confirm school route, education level, inspectorate framework and programme claims.",
    expectedEvidence: [
      "School programme, admissions and attendance records, inspection response",
    ],
    sourceIds: ["nl-b3-framework", "nl-private-types", "nl-public-special"],
    signalKeys: ["attendance", "ace"],
  }),
  action({
    id: "nl.childcare-quality",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For registered childcare, maintain the pedagogical plan, age- and service-specific staff-to-child ratios, stable groups, attendance and parent information.",
    applicabilityExplanation:
      "Daycare, BSO and other registered forms have different ratio and staffing rules; a generic nursery ratio would mislead.",
    unknownExplanation:
      "Confirm LRK category, child ages, group sizes, staffing, opening hours and allowed exceptions with the GGD.",
    expectedEvidence: [
      "Pedagogical plan, BKR calculations, rosters, attendance and GGD reports",
    ],
    sourceIds: ["nl-childcare-quality", "nl-childcare-ratios"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the service is outside registered childcare and confirm uncertain care with the municipality or GGD.",
  }),
  action({
    id: "nl.meldcode",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: { any: [formalSchool, childCare] },
    action:
      "Establish, train on and use the mandatory domestic-violence and child-abuse reporting code for covered education and childcare professionals.",
    applicabilityExplanation:
      "The meldcode applies to covered education and childcare services, not automatically to every community club.",
    unknownExplanation:
      "Confirm actual professional activities, responsible employer, designated contacts and reporting route.",
    expectedEvidence: [
      "Meldcode policy, staff training, confidential concern records and referral procedure",
    ],
    sourceIds: ["nl-meldcode"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "nl.social-safety",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: formalSchool,
    action:
      "For a covered school, maintain social-safety policy, a coordinator and contact point, and annual monitoring of pupils' safety.",
    applicabilityExplanation:
      "The inspectorate identifies statutory social-safety duties for primary, secondary and special schools; school type and age need verification.",
    unknownExplanation:
      "Confirm school classification, learner age, monitoring method, coordinator and inspectorate reporting.",
    expectedEvidence: [
      "Safety policy, coordinator details, annual pupil survey and inspectorate submission",
    ],
    sourceIds: ["nl-social-safety", "nl-social-monitor"],
    signalKeys: ["safeguarding", "attendance"],
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Annual pupil monitoring described by the Education Inspectorate.",
  }),
  action({
    id: "nl.school-abuse-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: formalSchool,
    action:
      "Ensure the school knows when alleged sexual misconduct by staff involving a minor pupil must be escalated to the inspectorate's confidential inspector and reported.",
    applicabilityExplanation:
      "This school-specific reporting route is triggered by particular allegations; it is not a routine disclosure of case details in the tracker.",
    unknownExplanation:
      "Confirm institution classification, staff role, incident category and current reporting procedure.",
    expectedEvidence: [
      "Restricted escalation procedure, trained leadership and contact list",
    ],
    sourceIds: ["nl-school-abuse"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "nl.childcare-prk",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For registered childcare, verify the applicable VOG and PRK registration and linkage for workers and others structurally present before covered activity.",
    applicabilityExplanation:
      "PRK scope includes specified staff, volunteers and structurally present people; a parent merely dropping off their own child is not in scope.",
    unknownExplanation:
      "Confirm actual childcare category, roles, presence frequency, external activity venues and PRK linkage with the provider or GGD.",
    expectedEvidence: [
      "Role assessment, VOG/PRK verification, linkage and review details in a restricted register",
    ],
    sourceIds: ["nl-childcare-prk", "nl-childcare-vog"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site or person is outside PRK scope and verify uncertain roles with the municipality, GGD or PRK authority.",
  }),
  action({
    id: "nl.school-vog",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Map school roles requiring a VOG and verify the correct certificate and teaching authority for each covered role.",
    applicabilityExplanation:
      "The inspectorate says VOG is mandatory for some roles, including teachers and particular child-supervision roles; it is not required merely because a person has an adult account.",
    unknownExplanation:
      "Confirm employment, duties, teaching level and statutory VOG/qualification route.",
    expectedEvidence: [
      "Role matrix, VOG verification and teaching-qualification record",
    ],
    sourceIds: ["nl-school-vog", "nl-b3-framework"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the absence of a covered role and verify uncertain duties with the inspectorate or municipality.",
  }),
  action({
    id: "nl.childcare-training",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "Verify childcare staff qualifications, language and age-specific training, supervision and development records for the actual LRK service.",
    applicabilityExplanation:
      "Daycare, BSO, baby care and trainee roles have different requirements; do not assume every adult account is a childcare worker.",
    unknownExplanation:
      "Confirm LRK category, actual role, child age group, qualification and current transitional rules with the GGD.",
    expectedEvidence: [
      "Qualification and language checks, training plan, baby-care records and staff roster",
    ],
    sourceIds: ["nl-childcare-training", "nl-childcare-quality"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no regulated childcare role exists and confirm a doubtful staffing arrangement with the GGD or municipality.",
  }),
  action({
    id: "nl.municipal-interface",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: municipality,
    action:
      "Identify the site's municipality and confirm any local childcare, building-use, school-attendance or activity decision that its actual provision needs.",
    applicabilityExplanation:
      "CBS identifies the municipality, but a selected location is not proof of a licence or a complete review of local rules.",
    unknownExplanation:
      "Confirm the operating address, municipality, building function, childcare status and authority correspondence.",
    expectedEvidence: [
      "Municipality record and applicable written decisions or no-permit assessment",
    ],
    sourceIds: ["nl-municipalities", "nl-childcare-start", "nl-bbl-school"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no municipality-facing step applies and check uncertain requirements with the site's municipality before skipping.",
  }),
  action({
    id: "nl.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For actual ICCE participation, verify provider registration, responsible staff training and renewal terms.",
    applicabilityExplanation:
      "ICCE terms apply only to participating providers and do not establish Dutch B3/B4 school status or qualification recognition.",
    unknownExplanation:
      "Confirm ICCE participation, provider registration, staff roles and renewal date.",
    expectedEvidence: ["ICCE registration, training and renewal records"],
    sourceIds: ["nl-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "nl.icce-learners",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For ICCE learners, verify enrolment, approved academic projections and moderation arrangements.",
    applicabilityExplanation:
      "Portal records can show evidence for provider checks without implying external approval or Dutch recognition.",
    unknownExplanation:
      "Confirm qualification path, learner enrolment, projection approval and moderation cycle with ICCE.",
    expectedEvidence: [
      "Enrolment confirmations, approved projections and moderation correspondence",
    ],
    sourceIds: ["nl-icce-enrolment", "nl-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
