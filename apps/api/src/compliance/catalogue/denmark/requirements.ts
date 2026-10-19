import type { CatalogueRequirement } from "../schema";
import { denmarkRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const under15 = { field: "minimumAge", op: "lte", value: 14 } as const;
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

export const denmarkRequirements: CatalogueRequirement[] = [
  action({
    id: "dnk.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, daycare, out-of-school and other services with the competent Danish authority.",
    applicabilityExplanation:
      "Free primary schools, public schools, private daycare facilities, family daycare and private childcare arrangements use different routes. ACE branding and a Learning Centre screen set do not establish legal status or funding.",
    unknownExplanation:
      "Record ages, education and care pattern, founder, funding, premises and municipality; seek written authority advice where the route is uncertain.",
    expectedEvidence: [
      "Provision assessment and ministry or municipal classification advice where uncertain",
    ],
    sourceIds: [
      "dnk-free-school-creation",
      "dnk-free-school-overview",
      "dnk-daycare-rules",
    ],
    signalKeys: [],
  }),
  action({
    id: "dnk.free-school-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "If the site is a free primary school, retain its creation notification and any separate approval for state subsidy.",
    applicabilityExplanation:
      "The ministry describes notification and a further approval application for new free primary schools seeking state subsidy. An independent-school profile alone does not prove that the free-primary or subsidy route applies.",
    unknownExplanation:
      "Confirm school level, founder, current funding arrangement and the ministry's applicable process before dismissing the route.",
    expectedEvidence: [
      "School classification, notification, subsidy approval if sought, and current ministry correspondence",
    ],
    sourceIds: ["dnk-free-school-creation", "dnk-free-school-overview"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual school is outside the free-primary route or not seeking state subsidy; check with the ministry when uncertain.",
  }),
  action({
    id: "dnk.free-school-supervision",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "For an actual free primary school, maintain its local self-evaluation or certified-supervisor route and required public information.",
    applicabilityExplanation:
      "The ministry says free primary schools choose approved self-evaluation or certified supervision. This cannot be imposed on every independent education provider from the portal category alone.",
    unknownExplanation:
      "Confirm whether the institution is a free primary school and which supervision route applies.",
    expectedEvidence: [
      "Approved self-evaluation model and results or certified-supervisor appointment, notices and published information",
    ],
    sourceIds: ["dnk-free-school-supervision"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the actual registered school category and confirm the oversight route with the ministry.",
  }),
  action({
    id: "dnk.daycare-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Determine the actual daycare or childcare form and retain the municipality's approval or operating agreement where required.",
    applicabilityExplanation:
      "Private daycare facilities, independent facilities, private family daycare and private childcare arrangements have distinct municipal routes. The childcare flag cannot choose among them.",
    unknownExplanation:
      "Confirm care ages, service pattern, place, provider, funding and municipality before marking any route inapplicable.",
    expectedEvidence: [
      "Municipal classification and approval or agreement, capacity, conditions and supervision correspondence",
    ],
    sourceIds: ["dnk-daycare-rules", "dnk-daycare-types"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why actual provision is outside the municipal daycare routes and confirm with the municipality.",
  }),
  action({
    id: "dnk.child-notification",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Maintain a route for notifying the municipality about a child welfare concern and train child-facing workers on their applicable duty.",
    applicabilityExplanation:
      "The Ministry of Social Affairs explains the general notification duty under Children's Act section 135 and the extended professional duty under section 133. The professional threshold depends on role and service.",
    unknownExplanation:
      "Confirm learner ages, actual worker roles, the local municipality and emergency escalation contacts.",
    expectedEvidence: [
      "Referral procedure, worker briefing, municipality contacts and restricted notification records",
    ],
    sourceIds: ["dnk-child-reporting"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "dnk.child-certificate",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: under15,
    action:
      "Assess which actual workers and volunteers need a Danish child certificate before under-15 child-contact work.",
    applicabilityExplanation:
      "Police guidance permits certificates for eligible roles with direct contact or opportunity for contact with children under 15; mandatory collection depends on sector regulations. An adult portal account alone is not a role.",
    unknownExplanation:
      "Identify each role, child ages, contact opportunity, legal basis and competent sector rule before requesting or dismissing a certificate.",
    expectedEvidence: [
      "Role assessment, consent and permitted certificate verification with organisation review date",
    ],
    sourceIds: ["dnk-child-certificate"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "dnk.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, health, safeguarding and staff data and identify the site's controller or processor role.",
    applicabilityExplanation:
      "GDPR obligations follow actual processing. The Danish data-protection authority publishes school and daycare guidance.",
    unknownExplanation:
      "Identify purposes, recipients, processors and whether record, breach, DPIA or DPO duties apply.",
    expectedEvidence: [
      "Processing map, role decisions and documented conditional-duty assessment",
    ],
    sourceIds: ["dnk-privacy-schools", "dnk-gdpr"],
    signalKeys: [],
  }),
  action({
    id: "dnk.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and security for personal data controlled by the site.",
    applicabilityExplanation:
      "GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; health and other special-category data require an Article 9 condition.",
    unknownExplanation:
      "Confirm controller role, data categories, lawful bases and Danish implementation before marking this inapplicable.",
    expectedEvidence: [
      "Lawful-basis record, privacy notices, retention schedule, security and special-category assessment",
    ],
    sourceIds: ["dnk-gdpr", "dnk-privacy-schools"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "dnk.workplace-apv",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Complete a workplace assessment (APV) with employees and keep a written plan for risks not resolved immediately.",
    applicabilityExplanation:
      "The Danish Working Environment Authority says every workplace with employees must complete an APV.",
    unknownExplanation:
      "Confirm employer status, work locations, tasks and shared-premises responsibilities.",
    expectedEvidence: [
      "APV, employee involvement, written action plan and review record",
    ],
    sourceIds: ["dnk-workplace-apv"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "dnk.local-premises",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check permitted building use, fire, hygiene and accessibility conditions with the municipality for the actual service.",
    applicabilityExplanation:
      "Municipal daycare approvals include local criteria. School and other premises may use different authorities and conditions; the national pack does not settle them.",
    unknownExplanation:
      "Record the municipality, building use, owner responsibilities and provider category before dismissing an approval.",
    expectedEvidence: [
      "Applicable building, fire and hygiene approvals or written municipal advice",
    ],
    sourceIds: ["dnk-daycare-rules", "dnk-regional-change"],
    signalKeys: [],
  }),
  action({
    id: "dnk.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "For an actual free primary school, align teaching goals, plans, evaluation and published information with its school category.",
    applicabilityExplanation:
      "The ministry describes free-primary teaching and quality oversight; not every independent learning centre is a school.",
    unknownExplanation:
      "Confirm school category, pupil ages, programme and the applicable ministry requirements.",
    expectedEvidence: [
      "Teaching goals and plans, evaluation, parent information and oversight records",
    ],
    sourceIds: ["dnk-free-school-curriculum", "dnk-free-school-supervision"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "dnk.daycare-operations",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Match care plans, child numbers, parent information and supervision records to the approved municipal childcare form.",
    applicabilityExplanation:
      "The public administration portal distinguishes private daycare facilities and private childcare arrangements; their curriculum and supervision requirements are not identical.",
    unknownExplanation:
      "Confirm approved form, child ages, capacity, municipality and care locations.",
    expectedEvidence: [
      "Municipal approval, care plan, parent information, capacity and inspection records",
    ],
    sourceIds: ["dnk-daycare-rules", "dnk-daycare-types"],
    signalKeys: ["personnel", "medical"],
  }),
  action({
    id: "dnk.food-route",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: food,
    action:
      "Assess whether the site's food activity needs Danish food-business registration or approval and maintain applicable hygiene controls.",
    applicabilityExplanation:
      "The Danish food authority describes registration and approval, including a limited-activity threshold. EU hygiene duties depend on actual food-business activity and any exception.",
    unknownExplanation:
      "Identify preparation, service, school catering, scale and competent food authority before choosing the route.",
    expectedEvidence: [
      "Food activity assessment, registration or authority decision, and proportionate hygiene records",
    ],
    sourceIds: ["dnk-food-register", "dnk-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the limited-activity exception or why the site is outside food-business scope, and confirm with the food authority when uncertain.",
  }),
  action({
    id: "dnk.trip-planning",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site supervision, transport, permissions and emergency response, then check the provider's municipal and ministry requirements.",
    applicabilityExplanation:
      "Child-protection and workplace guidance support risk-led planning; specific trip and transport duties remain under review.",
    unknownExplanation:
      "Record destination, ages, organiser, staff roles and vehicle arrangements; seek competent authority advice when uncertain.",
    expectedEvidence: [
      "Visit risk plan, permissions, emergency contacts and relevant authority advice",
    ],
    sourceIds: ["dnk-child-reporting", "dnk-workplace-apv"],
    signalKeys: ["trips"],
  }),
  action({
    id: "dnk.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal evidence when the site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is separate from ACE branding and Danish school recognition; portal data does not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["dnk-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "dnk.icce-academic",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep ICCE enrolment, approved academic projections and moderation evidence current.",
    applicabilityExplanation:
      "Provider requirements follow actual qualifications and enrolled students, not the portal vertical.",
    unknownExplanation:
      "Confirm qualifications, enrolled students and provider-approved timetable.",
    expectedEvidence: [
      "Enrolment acknowledgements, approved projections and moderation records",
    ],
    sourceIds: ["dnk-icce-enrolment", "dnk-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
