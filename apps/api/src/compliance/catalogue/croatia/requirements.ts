import type { CatalogueRequirement } from "../schema";
import { croatiaRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const independent = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    independent,
  ],
};
const care: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
const shorterPreschool: CatalogueRequirement["condition"] = {
  all: [
    { field: "providerCategory", op: "eq", value: "OUT_OF_SCHOOL" },
    { field: "minimumAge", op: "lte", value: 6 },
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

export const croatiaRequirements: CatalogueRequirement[] = [
  action({
    id: "hrv.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify actual school, kindergarten, shorter preschool, tutoring or other provision and identify its competent Croatian authority.",
    applicabilityExplanation:
      "School, kindergarten and shorter preschool programmes have different approval routes. ACE branding and portal screens do not establish legal status.",
    unknownExplanation:
      "Record ages, hours, curriculum, care, funding, premises and county or Zagreb before deciding whether the site is a regulated institution or programme.",
    expectedEvidence: [
      "Provision assessment and written education-authority advice when classification is uncertain",
    ],
    sourceIds: [
      "hrv-school-establishment",
      "hrv-kindergarten-establishment",
      "hrv-preschool-shorter",
    ],
    signalKeys: [],
  }),
  action({
    id: "hrv.private-school-start",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "For an actual private primary or secondary school, retain the founding act, ministry decisions and approval to begin work.",
    applicabilityExplanation:
      "Government school-establishment guidance sets a ministry route for private schools; a learning centre is not automatically a school.",
    unknownExplanation:
      "Confirm whether the provision is legally a school and obtain ministry advice before treating this route as inapplicable.",
    expectedEvidence: [
      "Founding act, conformity decision, start-of-work decision and register record",
    ],
    sourceIds: ["hrv-school-establishment", "hrv-education-inspection"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after documented provision facts or written competent-authority advice establish that this is not a private school.",
  }),
  action({
    id: "hrv.child-protection-response",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Give child-facing staff a documented route for urgent abuse or neglect concerns and record referrals securely.",
    applicabilityExplanation:
      "The Ministry of the Interior publishes Red Button reporting and a child-abuse protocol; duties for a particular institution need its sector rules reviewed.",
    unknownExplanation:
      "Identify police, social-welfare and education contacts for the site; do not delay an urgent report while legal classification is resolved.",
    expectedEvidence: [
      "Reporting procedure, trained contact, referral record and local escalation details",
    ],
    sourceIds: ["hrv-child-report", "hrv-child-protocol"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "hrv.role-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess child-facing roles for qualifications and legally appropriate criminal-history checks before appointment.",
    applicabilityExplanation:
      "A certificate of no ongoing proceedings is different from a criminal-record certificate; role requirements depend on school, preschool and employment rules. An adult portal login alone is not a staff role.",
    unknownExplanation:
      "Confirm role, contact, qualifications, applicable sector restrictions and the correct certificate with the competent authority.",
    expectedEvidence: [
      "Role assessment, verified qualifications, correct check type and organisation review date",
    ],
    sourceIds: [
      "hrv-criminal-certificate",
      "hrv-education-inspection",
      "hrv-preschool-law",
    ],
    signalKeys: ["personnel"],
  }),
  action({
    id: "hrv.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map site personal-data processing and establish controller or processor responsibility.",
    applicabilityExplanation:
      "The Croatian data-protection authority explains that controller status follows processing purposes and means, not the site's sector label.",
    unknownExplanation:
      "Identify pupil, health, safeguarding, staff and family data flows, recipients and contracts.",
    expectedEvidence: [
      "Processing map, controller decisions and processor agreements",
    ],
    sourceIds: ["hrv-privacy-regulator", "hrv-gdpr"],
    signalKeys: [],
  }),
  action({
    id: "hrv.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and security for the site's personal data.",
    applicabilityExplanation:
      "EU GDPR Articles 5, 6, 13, 14 and 32 apply to a controller; health and other special-category data require a separate Article 9 condition.",
    unknownExplanation:
      "Confirm controller role, purposes, sensitive categories, recipients and Croatian detail.",
    expectedEvidence: [
      "Lawful-basis register, versioned notices, retention schedule, security and special-category assessment",
    ],
    sourceIds: ["hrv-gdpr", "hrv-privacy-regulator"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "hrv.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Prepare a written workplace risk assessment and arrange occupational-safety responsibilities and worker training.",
    applicabilityExplanation:
      "Croatian government employer guidance requires risk assessment, suitable safety arrangements and safe-work training.",
    unknownExplanation:
      "Confirm employer, workers, shared premises, activities and competent safety specialist route.",
    expectedEvidence: [
      "Written risk assessment, preventive measures, worker training and responsible safety arrangements",
    ],
    sourceIds: ["hrv-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "hrv.workplace-first-aid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Arrange workplace first aid and emergency response appropriate to staff and assessed risks.",
    applicabilityExplanation:
      "Croatian employer guidance covers first aid and risk-led safety obligations; building and institution rules may add conditions.",
    unknownExplanation:
      "Confirm staffing, hours, hazards and building authority requirements.",
    expectedEvidence: [
      "First-aid arrangements, trained roles, equipment and emergency procedures",
    ],
    sourceIds: ["hrv-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "hrv.local-premises",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Confirm premises use, fire, accessibility and health requirements with the county or Zagreb and local building authorities.",
    applicabilityExplanation:
      "National employer duties do not establish permission for a particular building or education programme.",
    unknownExplanation:
      "Record county, municipality, building use, landlord responsibilities and provider category.",
    expectedEvidence: [
      "Local authority advice, use permissions and health/fire assessment",
    ],
    sourceIds: [
      "hrv-kindergarten-establishment",
      "hrv-preschool-shorter",
      "hrv-work-safety",
    ],
    signalKeys: [],
  }),
  action({
    id: "hrv.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Match the school's approved curriculum, attendance and inspection arrangements to its actual status.",
    applicabilityExplanation:
      "Recognised schools teach ministry-approved plans or curricula and fall under education inspection; this does not classify tutoring as a school.",
    unknownExplanation:
      "Confirm approval, programme, pupil ages and county inspection contacts.",
    expectedEvidence: [
      "Approved programme, attendance process and inspection correspondence",
    ],
    sourceIds: ["hrv-school-curriculum", "hrv-education-inspection"],
    signalKeys: ["attendance", "personnel"],
  }),
  action({
    id: "hrv.kindergarten-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Confirm whether care is a kindergarten, nursery-age preschool provision or another service and obtain its programme and start-of-work decisions.",
    applicabilityExplanation:
      "Croatian preschool law covers children from six months to school entry; actual kindergartens require an approved programme and county or Zagreb start decision.",
    unknownExplanation:
      "Confirm ages, care hours, founder, programme, county and premises before selecting the registration route.",
    expectedEvidence: [
      "Service classification, approved programme, county/Zagreb decision, staff and premises record",
    ],
    sourceIds: [
      "hrv-kindergarten-establishment",
      "hrv-preschool-law",
      "hrv-kindergarten-operations",
    ],
    signalKeys: ["personnel", "medical"],
  }),
  action({
    id: "hrv.shorter-preschool",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: shorterPreschool,
    action:
      "Determine whether a shorter preschool programme is offered outside a kindergarten and, if so, confirm ministry consent and the county or Zagreb start-of-work decision.",
    applicabilityExplanation:
      "Government guidance provides a separate approval route for shorter programmes run by associations, other legal entities or craftspeople. Young pupils alone do not prove that a centre offers such a programme.",
    unknownExplanation:
      "Confirm whether this is preschool education rather than general tutoring; ask the county education body before dismissing the route.",
    expectedEvidence: [
      "Programme consent, premises evidence, county/Zagreb decision and registry entry",
    ],
    sourceIds: ["hrv-preschool-shorter"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the ages and actual programme and confirm with the county or Zagreb education office if this route is uncertain.",
  }),
  action({
    id: "hrv.food-route",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Notify or register the food business and establishment with the correct Croatian authority and maintain HACCP-based hygiene procedures.",
    applicabilityExplanation:
      "The State Inspectorate maintains a food-business register; EU hygiene duties depend on actual food activity and some activities use specialist approval.",
    unknownExplanation:
      "Identify preparation, supply, service and the competent sanitary or veterinary authority before selecting a route.",
    expectedEvidence: [
      "Authority registration or decision and food-hygiene procedures",
    ],
    sourceIds: ["hrv-food-register", "hrv-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "hrv.trip-planning",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site activity supervision, transport, permissions and emergency arrangements, then check any school or local rules.",
    applicabilityExplanation:
      "Child-protection and workplace guidance support risk-based planning, but specific travel and education rules remain under review.",
    unknownExplanation:
      "Record destination, ages, organiser, staff roles, transport and competent authority.",
    expectedEvidence: [
      "Visit risk plan, permissions, emergency contacts and authority advice where required",
    ],
    sourceIds: ["hrv-child-protocol", "hrv-work-safety"],
    signalKeys: ["trips"],
  }),
  action({
    id: "hrv.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal evidence when the site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is separate from ACE branding and Croatian school recognition; portal records do not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["hrv-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "hrv.icce-academic",
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
    sourceIds: ["hrv-icce-enrolment", "hrv-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
