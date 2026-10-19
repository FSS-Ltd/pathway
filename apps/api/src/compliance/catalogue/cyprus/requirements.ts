import type { CatalogueRequirement } from "../schema";
import { cyprusRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const outOfSchool = {
  field: "providerCategory",
  op: "eq",
  value: "OUT_OF_SCHOOL",
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

export const cyprusRequirements: CatalogueRequirement[] = [
  action({
    id: "cyp.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual provision as a school, private institute, pre-school care centre, school-age day-care centre or other activity with the competent Cyprus authority.",
    applicabilityExplanation:
      "The Ministry of Education and Social Welfare Services administer different approval routes. ACE branding, a Learning Centre label and a public-facing screen set do not establish legal status or funding.",
    unknownExplanation:
      "Record ages, care hours, education pattern, curriculum, funding, premises and district; seek written authority advice where the route is uncertain.",
    expectedEvidence: [
      "Provision assessment and written Ministry or district Social Welfare advice where classification is uncertain",
    ],
    sourceIds: [
      "cyp-private-education",
      "cyp-preschool-care",
      "cyp-school-age-care",
    ],
    signalKeys: [],
  }),
  action({
    id: "cyp.private-school-approval",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "For an actual private school, retain ministerial approval and the school's current registration and operating documents.",
    applicabilityExplanation:
      "The Ministry says private kindergartens, primary and secondary schools cannot operate without ministerial approval under the 2019 private-school law. This route is conditional on actual private-school status.",
    unknownExplanation:
      "Confirm school category and approval with the Ministry before deciding this route does not apply.",
    expectedEvidence: [
      "Ministerial approval, approved school details and any current operating conditions",
    ],
    sourceIds: ["cyp-private-education", "cyp-school-operation"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document actual provision and obtain Ministry advice when legal school status is uncertain.",
  }),
  action({
    id: "cyp.private-institute-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Check whether out-of-school teaching is a private institute or private educational centre requiring Ministry approval.",
    applicabilityExplanation:
      "The Ministry treats private institutes separately from private schools. The portal's OUT_OF_SCHOOL category does not by itself establish that the institute law applies.",
    unknownExplanation:
      "Record subjects, delivery pattern, learner ages and district, then confirm the route with the Ministry.",
    expectedEvidence: [
      "Ministry classification advice and approval or documented reason this is outside the private-institute route",
    ],
    sourceIds: ["cyp-private-education"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why actual services are outside the private-institute route and check with the Ministry when uncertain.",
  }),
  action({
    id: "cyp.child-protection-response",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-protection reporting route, named contact and secure concern records for child-facing services.",
    applicabilityExplanation:
      "Cyprus Police has a safeguarding function; sector-specific notification and training duties need confirmation against the provider's legal category.",
    unknownExplanation:
      "Identify urgent police and local Social Welfare contacts and any Ministry reporting directions for the site.",
    expectedEvidence: [
      "Safeguarding procedure, trained contact, local referral details and restricted concern records",
    ],
    sourceIds: ["cyp-child-protection", "cyp-preschool-care"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "cyp.care-staff-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Verify the qualifications, criminal-record and child-protection clearance documents required for each actual day-care staff role.",
    applicabilityExplanation:
      "Official day-care application guidance lists manager and staff qualifications, clear criminal-record certificates and police certificates under the child sexual-abuse law. An adult portal account alone is not a staff role.",
    unknownExplanation:
      "Confirm whether the service is pre-school or school-age day care, each role and the current district application requirements.",
    expectedEvidence: [
      "Role assessment, qualification verification, applicable police certificates and organisation review dates",
    ],
    sourceIds: [
      "cyp-preschool-care",
      "cyp-school-age-care",
      "cyp-criminal-checks",
    ],
    signalKeys: ["personnel"],
  }),
  action({
    id: "cyp.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map pupil, family, health, safeguarding and staff data processing and establish controller or processor roles.",
    applicabilityExplanation:
      "GDPR duties depend on actual processing; the Cyprus Commissioner explains records of processing activities and controller responsibilities.",
    unknownExplanation:
      "Identify purposes, recipients, processors and whether Article 30's record requirement applies to each processing activity.",
    expectedEvidence: [
      "Processing map, controller decisions and Article 30 assessment",
    ],
    sourceIds: ["cyp-privacy-records", "cyp-gdpr"],
    signalKeys: [],
  }),
  action({
    id: "cyp.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and security for personal data controlled by the site.",
    applicabilityExplanation:
      "GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; health and other special-category data require an Article 9 condition.",
    unknownExplanation:
      "Confirm controller role, data categories, lawful bases, sensitive-data conditions and Cyprus-specific implementation.",
    expectedEvidence: [
      "Lawful-basis register, versioned notices, retention schedule, security and special-category assessment",
    ],
    sourceIds: ["cyp-gdpr", "cyp-privacy-records"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "cyp.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Keep a written workplace risk assessment and risk-led safety arrangements for staff and other affected people.",
    applicabilityExplanation:
      "Cyprus Department of Labour Inspection guidance states that employers and self-employed persons must prepare a written risk assessment.",
    unknownExplanation:
      "Confirm employer status, shared-premises responsibilities, activities and affected people.",
    expectedEvidence: [
      "Written risk assessment, preventive measures, responsible person and worker briefing",
    ],
    sourceIds: ["cyp-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "cyp.local-premises",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check permitted building use and relevant fire, health, electrical and accessibility conditions for the district and provider type.",
    applicabilityExplanation:
      "Day-care approval guidance lists building, fire, public-health and electrical evidence. A school or institute may use a different route.",
    unknownExplanation:
      "Record district, building use, owner responsibilities and actual provider category before dismissing a premises approval.",
    expectedEvidence: [
      "Building-use permission and applicable fire, health and technical approvals or authority advice",
    ],
    sourceIds: [
      "cyp-preschool-care",
      "cyp-school-age-care",
      "cyp-kindergarten",
    ],
    signalKeys: [],
  }),
  action({
    id: "cyp.school-operations",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: independent,
    action:
      "Match the private school's curriculum, internal rules, admissions and inspection records to its approved status.",
    applicabilityExplanation:
      "The Ministry distinguishes private-school types and describes approved operating arrangements; tutoring is not automatically a school.",
    unknownExplanation:
      "Check the school's approved category, ages, programmes and Ministry correspondence.",
    expectedEvidence: [
      "Approved curriculum and internal rules, pupil process and inspection correspondence",
    ],
    sourceIds: ["cyp-private-education", "cyp-school-operation"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "cyp.day-care-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Determine whether pre-school or school-age day-care registration is required and retain the Social Welfare certificate and operating records where it is.",
    applicabilityExplanation:
      "The pre-school Children Law route and school-age day-care law are separate. The site's childcare flag does not determine which one applies.",
    unknownExplanation:
      "Confirm ages, numbers of children, care hours, district and whether the activity is care rather than teaching alone.",
    expectedEvidence: [
      "Provision assessment, Social Welfare registration certificate, staffing and care records",
    ],
    sourceIds: [
      "cyp-preschool-care",
      "cyp-school-age-care",
      "cyp-kindergarten",
    ],
    signalKeys: ["personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document actual care pattern and ages, and confirm the route with district Social Welfare Services when uncertain.",
  }),
  action({
    id: "cyp.food-route",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Register the applicable food-business establishment and maintain proportionate food-hygiene procedures.",
    applicabilityExplanation:
      "Cyprus Public Health Services provides an establishment-registration route under Regulation (EC) 852/2004; food obligations depend on actual food-business activity.",
    unknownExplanation:
      "Identify preparation, supply, service and the competent authority before choosing the registration route.",
    expectedEvidence: [
      "Establishment registration or authority decision and HACCP-based hygiene procedures",
    ],
    sourceIds: ["cyp-food-register", "cyp-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "cyp.trip-planning",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site supervision, transport, permissions and emergency response, then check school and district requirements.",
    applicabilityExplanation:
      "Child-protection and workplace guidance support risk-led planning; specific trip and transport duties remain under review.",
    unknownExplanation:
      "Record destination, ages, organiser, staff roles, vehicle arrangements and the competent authority.",
    expectedEvidence: [
      "Visit risk plan, permissions, emergency contacts and authority advice where needed",
    ],
    sourceIds: ["cyp-child-protection", "cyp-work-safety"],
    signalKeys: ["trips"],
  }),
  action({
    id: "cyp.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal evidence when the site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is separate from ACE branding and Cyprus school recognition; portal data does not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["cyp-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "cyp.icce-academic",
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
    sourceIds: ["cyp-icce-enrolment", "cyp-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
