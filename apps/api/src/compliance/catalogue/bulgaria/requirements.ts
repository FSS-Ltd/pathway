import type { CatalogueRequirement } from "../schema";
import { bulgariaRequirement as action } from "./shared";

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

export const bulgariaRequirements: CatalogueRequirement[] = [
  action({
    id: "bgr.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify actual school, kindergarten, nursery, tutoring or other provision and identify its competent Bulgarian regulator.",
    applicabilityExplanation:
      "The education ministry registers private schools and kindergartens; nursery health rules use a different route. ACE branding and portal screens do not establish legal status.",
    unknownExplanation:
      "Record ages, hours, curriculum, care, funding, building and oblast before deciding whether the site is a statutory institution.",
    expectedEvidence: [
      "Provision assessment and written advice from the relevant education or health authority when classification is uncertain",
    ],
    sourceIds: [
      "bgr-education-law",
      "bgr-private-institution-service",
      "bgr-nursery-rules",
    ],
    signalKeys: [],
  }),
  action({
    id: "bgr.private-school-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independent,
    action:
      "For an actual private school, obtain entry and certificate in the education institution register before operating and record approved changes.",
    applicabilityExplanation:
      "The education ministry's current service and institution register apply to private schools; a learning centre is not automatically a school.",
    unknownExplanation:
      "Confirm legal school status and obtain written classification from the Regional Education Office if unclear.",
    expectedEvidence: [
      "Registration application, certificate, register entry and later change approvals",
    ],
    sourceIds: [
      "bgr-education-law",
      "bgr-private-institution-service",
      "bgr-education-register",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after documented provision facts or Regional Education Office advice establish that the site is not a private school.",
  }),
  action({
    id: "bgr.child-protection-report",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Give staff a procedure to notify the competent authority immediately when they learn that a child needs protection.",
    applicabilityExplanation:
      "The State Agency for Child Protection states that anyone aware of a child needing protection must immediately notify social assistance, the agency or police.",
    unknownExplanation:
      "Confirm the site's local social-assistance directorate and escalation contacts; do not delay urgent reporting while classifying the provider.",
    expectedEvidence: [
      "Reporting procedure, staff briefing, local contacts and restricted incident record",
    ],
    sourceIds: ["bgr-child-report"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "bgr.role-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess child-facing roles for qualification and criminal-record certificate requirements before appointment.",
    applicabilityExplanation:
      "Bulgarian criminal-record certificates exist, but eligibility and mandatory checks depend on the actual education or care role. An adult or parent portal login alone is not a staff role.",
    unknownExplanation:
      "Identify duties, supervised contact, sector rules, qualifications and competent authority instructions.",
    expectedEvidence: [
      "Role assessment, verified qualifications, applicable certificate and organisation review date",
    ],
    sourceIds: [
      "bgr-criminal-record",
      "bgr-education-law",
      "bgr-nursery-rules",
    ],
    signalKeys: ["personnel"],
  }),
  action({
    id: "bgr.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map site personal-data processing and determine controller or processor responsibility.",
    applicabilityExplanation:
      "EU GDPR status follows who determines processing purposes and means, not the site's chosen sector or screen set.",
    unknownExplanation:
      "Identify pupil, health, safeguarding, staff and family data flows, recipients and contracts.",
    expectedEvidence: [
      "Processing map, controller decisions and processor contracts",
    ],
    sourceIds: ["bgr-privacy-regulator", "bgr-gdpr"],
    signalKeys: [],
  }),
  action({
    id: "bgr.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and proportionate security for the site's personal data.",
    applicabilityExplanation:
      "EU GDPR Articles 5, 6, 13, 14 and 32 apply to a controller; health and other special-category data require a separate Article 9 condition.",
    unknownExplanation:
      "Confirm controller role, purposes, sources, recipients, sensitive categories and applicable Bulgarian detail.",
    expectedEvidence: [
      "Lawful-basis register, versioned notices, retention schedule, security and special-category assessment",
    ],
    sourceIds: ["bgr-gdpr", "bgr-privacy-regulator"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "bgr.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Evaluate workplace risks and record preventive measures for staff, including shared-premises coordination.",
    applicabilityExplanation:
      "Bulgarian workplace safety law and Ministry guidance require employer risk assessment; building and public-use rules need separate local review.",
    unknownExplanation:
      "Confirm employer, workers, activities, premises control and any shared-site responsibilities.",
    expectedEvidence: [
      "Risk assessment, protective measures, responsible person and shared-premises agreement where relevant",
    ],
    sourceIds: ["bgr-work-risk", "bgr-work-firstaid"],
    signalKeys: [],
  }),
  action({
    id: "bgr.workplace-emergency",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Arrange workplace first aid, fire response and evacuation appropriate to the site's risks and staff.",
    applicabilityExplanation:
      "The Health and Safety at Work Act requires an organisation for first aid, fire and evacuation; institution and building rules may add conditions.",
    unknownExplanation:
      "Confirm workforce, activity risks, building use and the competent fire or health authority's requirements.",
    expectedEvidence: [
      "First-aid plan, trained roles, equipment, fire and evacuation procedures, exercises and review",
    ],
    sourceIds: ["bgr-work-firstaid"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "bgr.local-premises",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Confirm building use, fire, accessibility and public-health conditions with the municipality and relevant oblast authorities.",
    applicabilityExplanation:
      "National workplace duties do not establish local building permission; schools and nurseries may have different premises requirements.",
    unknownExplanation:
      "Record municipality, oblast, building type, use permissions and responsible landlord or operator.",
    expectedEvidence: [
      "Local authority advice, use permissions, health/fire assessment and shared-premises agreement",
    ],
    sourceIds: [
      "bgr-regional-health",
      "bgr-regional-education",
      "bgr-nursery-rules",
    ],
    signalKeys: [],
  }),
  action({
    id: "bgr.school-operations",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Confirm curriculum, attendance, staffing and inspection conditions for the site's actual school status with its Regional Education Office.",
    applicabilityExplanation:
      "The Preschool and School Education Act governs recognised school institutions; this action does not turn tutoring or ACE identity into school status.",
    unknownExplanation:
      "Confirm school category, registration, funding, pupil ages and the competent regional office.",
    expectedEvidence: [
      "School-status decision, approved programme, attendance arrangements, staffing and inspection correspondence",
    ],
    sourceIds: ["bgr-education-law", "bgr-regional-education"],
    signalKeys: ["attendance", "personnel"],
  }),
  action({
    id: "bgr.childcare-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Determine whether the provision is a kindergarten, nursery, children's kitchen or other childcare service and obtain the applicable education or health authority conditions.",
    applicabilityExplanation:
      "Private kindergartens use the education institution register; nurseries and children's kitchens also have Health Ministry rules. One route must not be applied to all care.",
    unknownExplanation:
      "Confirm ages, care hours, meals, public/private status, municipality and Regional Health Inspectorate.",
    expectedEvidence: [
      "Service classification, applicable register or health-authority record, staffing and premises requirements",
    ],
    sourceIds: [
      "bgr-private-institution-service",
      "bgr-nursery-rules",
      "bgr-regional-health",
    ],
    signalKeys: ["personnel", "medical"],
  }),
  action({
    id: "bgr.food-route",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Confirm Bulgarian Food Safety Agency establishment registration and maintain proportionate HACCP-based food-hygiene procedures.",
    applicabilityExplanation:
      "EU food hygiene duties and Bulgarian establishment registration depend on actual food-business activity; specialist approvals need activity-specific review.",
    unknownExplanation:
      "Identify meals, preparation, distribution and the competent regional food-safety office before selecting a route.",
    expectedEvidence: [
      "Establishment registration or authority decision and food-safety procedures",
    ],
    sourceIds: ["bgr-food-law", "bgr-food-register", "bgr-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "bgr.trip-planning",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site activities with supervision, transport, permissions and emergency arrangements, then check any regional or school-specific rules.",
    applicabilityExplanation:
      "Child-protection and workplace duties support risk-based planning, but specialist travel or education rules are not fully reviewed in this pack.",
    unknownExplanation:
      "Record destination, ages, transport, organiser, staff roles and local authority route.",
    expectedEvidence: [
      "Visit risk plan, permissions, emergency contacts and authority advice when required",
    ],
    sourceIds: ["bgr-child-report", "bgr-work-risk"],
    signalKeys: ["trips"],
  }),
  action({
    id: "bgr.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal evidence when the site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is separate from ACE branding and Bulgarian school recognition; portal records do not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["bgr-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "bgr.icce-academic",
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
    sourceIds: ["bgr-icce-enrolment", "bgr-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
