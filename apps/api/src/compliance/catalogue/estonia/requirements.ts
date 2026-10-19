import type { CatalogueRequirement } from "../schema";
import { estoniaRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const care: CatalogueRequirement["condition"] = {
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

export const estoniaRequirements: CatalogueRequirement[] = [
  action({
    id: "est.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, hobby education, preschool, childcare and other services with the competent Estonian authority.",
    applicabilityExplanation:
      "Private general schools, hobby schools, preschools, childcare institutions and informal tuition use different routes. ACE branding and a Learning Centre screen set do not establish legal status or public funding.",
    unknownExplanation:
      "Record learner ages, curriculum, care pattern, legal operator, municipality and EHIS status; obtain written authority advice where uncertain.",
    expectedEvidence: [
      "Provision assessment and ministry or municipal classification advice where uncertain",
    ],
    sourceIds: [
      "est-education-licences",
      "est-private-schools-act",
      "est-early-childhood-act",
    ],
    signalKeys: [],
  }),
  action({
    id: "est.private-school-licence",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "If operating a private general school, retain the activity licence for its municipality and curriculum and keep EHIS particulars current.",
    applicabilityExplanation:
      "The ministry distinguishes a private school's activity licence from a municipal school's education permit. A portal independent-school category needs confirmation against the actual legal school route.",
    unknownExplanation:
      "Confirm the legal school type, curricula, municipalities of operation and ministry licence before dismissing this route.",
    expectedEvidence: [
      "Private-school activity licence, approved curricula, EHIS record and current ministry correspondence",
    ],
    sourceIds: ["est-education-licences", "est-private-schools-act"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the institution is not a private general school and confirm the applicable route with the ministry.",
  }),
  action({
    id: "est.hobby-school-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess whether organised out-of-school teaching is a hobby school requiring EHIS curriculum registration and an activity licence.",
    applicabilityExplanation:
      "The ministry describes a separate hobby-school route. A child-facing club or Learning Centre is not automatically a hobby school.",
    unknownExplanation:
      "Check actual programme structure, curricula, premises, operator and ministry classification before marking the route inapplicable.",
    expectedEvidence: [
      "Written hobby-school classification, EHIS registration or reason it is outside that route",
    ],
    sourceIds: ["est-education-licences"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the actual provision and why it falls outside the hobby-school route; seek ministry confirmation if uncertain.",
  }),
  action({
    id: "est.early-childhood-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Determine whether the service is a preschool, education childcare institution, social-care childcare service or another arrangement, and retain its current permit.",
    applicabilityExplanation:
      "The 2025 Early Childhood Education Act covers preschool and childcare institutions; ministry guidance separates these from social-care services. Former childcare licences had transitional conditions through 2026.",
    unknownExplanation:
      "Confirm ages, curriculum, care and support needs, licence history, operator and local authority before deciding the route.",
    expectedEvidence: [
      "Current activity licence or municipal permit, transition decision, EHIS or economic-activity record and authority correspondence",
    ],
    sourceIds: ["est-early-childhood-act", "est-early-childhood-guidance"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual care service is outside the preschool and childcare-institution routes and confirm with the ministry or municipality.",
  }),
  action({
    id: "est.child-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Maintain a procedure for promptly reporting a child in need to local government or 116111 and escalating immediate danger.",
    applicabilityExplanation:
      "Child Protection Act section 27 and Social Insurance Board guidance set out reporting duties and routes. The local government is responsible for child-protection response.",
    unknownExplanation:
      "Confirm learner ages, municipality, child-facing roles and emergency contacts.",
    expectedEvidence: [
      "Referral procedure, staff briefing, municipal and 116111 contacts and restricted reporting record",
    ],
    sourceIds: ["est-child-protection-act", "est-child-reporting"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "est.child-work-restrictions",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess actual child-facing workers and volunteers and verify statutory restrictions on working with children through the permitted register route.",
    applicabilityExplanation:
      "Child Protection Act section 20 concerns people actually working with children. Social Insurance Board guidance describes the dedicated restriction check; an adult or parent portal account alone is not a child-facing role.",
    unknownExplanation:
      "Identify duties, contact with children, the legal checking basis and any cross-border history before requesting or dismissing a check.",
    expectedEvidence: [
      "Role assessment, permitted restriction-check outcome, date and organisation review record without unnecessary conviction details",
    ],
    sourceIds: ["est-child-protection-act", "est-child-work-check"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "est.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, health, safeguarding and staff data and determine the site's controller or processor role.",
    applicabilityExplanation:
      "GDPR duties depend on actual processing. The Estonian Data Protection Inspectorate publishes school-specific processing and retention guidance.",
    unknownExplanation:
      "Identify purposes, processors, recipients, sensitive data and conditional record, breach, DPIA and DPO duties.",
    expectedEvidence: [
      "Processing map, controller assessment and documented conditional-duty review",
    ],
    sourceIds: ["est-gdpr", "est-school-privacy"],
    signalKeys: [],
  }),
  action({
    id: "est.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and security for personal data controlled by the site.",
    applicabilityExplanation:
      "GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; special-category health data require an Article 9 condition. School records must be retained for justified periods.",
    unknownExplanation:
      "Confirm controller status, data categories, lawful bases and retention rules before marking this inapplicable.",
    expectedEvidence: [
      "Lawful-basis record, privacy notices, retention schedule, access controls and sensitive-data assessment",
    ],
    sourceIds: ["est-gdpr", "est-school-privacy", "est-school-retention"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "est.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Complete an employee workplace risk assessment and action plan, and submit it through the Labour Inspectorate route where required.",
    applicabilityExplanation:
      "Labour Inspectorate guidance requires an employer with at least one employee under an employment contract to submit its assessment through TEIS; worker status matters.",
    unknownExplanation:
      "Confirm employment contracts, work sites, shared-premises responsibilities and the current TEIS submission rule.",
    expectedEvidence: [
      "Risk assessment, action plan, worker involvement and submission confirmation where required",
    ],
    sourceIds: ["est-workplace-risk"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "est.local-premises",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check building use, fire, health, accessibility and child-care premises conditions for the actual service with local authorities.",
    applicabilityExplanation:
      "Early childhood provision has its own learning-environment requirements; other school and community premises have different conditions that this national core does not settle.",
    unknownExplanation:
      "Record municipality, building use, provider category, owner responsibilities and local approval route.",
    expectedEvidence: [
      "Applicable premises approvals, inspections or written municipal and specialist-authority advice",
    ],
    sourceIds: ["est-early-childhood-act", "est-regional-statistics"],
    signalKeys: [],
  }),
  action({
    id: "est.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "For an actual private general school, align its approved curriculum, admissions and pupil-support records with its licence and school stage.",
    applicabilityExplanation:
      "National curricula apply across legal school forms; licence and stage-specific duties must be confirmed rather than inferred from an ACE or portal school label.",
    unknownExplanation:
      "Confirm legal school type, stage, curricula and ministry approval.",
    expectedEvidence: [
      "Approved curricula, admissions information, pupil-support policy and EHIS record",
    ],
    sourceIds: ["est-private-schools-act", "est-general-education"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the site is not an actual private general school and confirm the alternative education route.",
  }),
  action({
    id: "est.early-childhood-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "For an actual preschool or education childcare institution, assess curriculum, staffing, child support and parent-information duties under the current Act.",
    applicabilityExplanation:
      "The 2025 Act distinguishes preschool and childcare institution rules; the care flag cannot select the subtype or applicable ratios alone.",
    unknownExplanation:
      "Confirm institution type, child ages, curriculum, licence and municipality before dismissing or completing this action.",
    expectedEvidence: [
      "Institution classification, curriculum, staffing/qualification review and parent information",
    ],
    sourceIds: ["est-early-childhood-act", "est-early-childhood-guidance"],
    signalKeys: ["attendance", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual service is outside education childcare or preschool provision and confirm with the authority.",
  }),
  action({
    id: "est.food-route",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: food,
    action:
      "Determine whether continuing food provision requires an Agriculture and Food Board notice or activity licence and maintain a self-control plan.",
    applicabilityExplanation:
      "Official catering guidance expressly includes schools and preschools and distinguishes continuing food-business operations from occasional private charity or school-fair activity.",
    unknownExplanation:
      "Confirm operator, frequency, preparation, service venue and whether the school or preschool catering route applies.",
    expectedEvidence: [
      "Authority notification or licence, self-control plan, hygiene records or reason for an occasional-event exclusion",
    ],
    sourceIds: ["est-food-catering", "est-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the activity is outside continuing food-business requirements and confirm the conclusion with the food authority.",
  }),
  action({
    id: "est.trip-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Review trip supervision, parent information, safeguarding, transport and personal-data sharing for the actual itinerary.",
    applicabilityExplanation:
      "Trips can create child-safety and data-processing duties, but this national core does not establish a universal trip-permit rule.",
    unknownExplanation:
      "Confirm destinations, ages, operator, transport, overnight care and local or cross-border requirements.",
    expectedEvidence: [
      "Trip risk assessment, supervision plan, parent information and applicable authority advice",
    ],
    sourceIds: ["est-child-protection-act", "est-school-privacy"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the actual activity does not involve a supervised trip and check any uncertain local or cross-border route.",
  }),
  action({
    id: "est.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "If offering ICCE qualifications, keep provider registration and renewal evidence current.",
    applicabilityExplanation:
      "ICCE provider terms apply only to actual participating institutions. ICCE participation does not replace Estonian school or childcare authorisation.",
    unknownExplanation:
      "Confirm whether this site actually offers ICCE qualifications and its provider relationship.",
    expectedEvidence: [
      "ICCE registration, renewal and provider correspondence",
    ],
    sourceIds: ["est-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "est.icce-delivery",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For ICCE learners, maintain enrolment, approved academic projections and moderation records.",
    applicabilityExplanation:
      "These provider processes apply to actual ICCE delivery, independently of Estonian legal school status or funding.",
    unknownExplanation:
      "Confirm active ICCE learners, level and moderation arrangements with the provider.",
    expectedEvidence: [
      "Enrolment confirmations, approved projections, training and moderation correspondence",
    ],
    sourceIds: ["est-icce-enrolment", "est-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
