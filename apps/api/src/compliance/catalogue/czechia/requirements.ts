import type { CatalogueRequirement } from "../schema";
import { czechiaRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
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

export const czechiaRequirements: CatalogueRequirement[] = [
  action({
    id: "cze.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual Czech education, childcare and other activities and confirm the competent registration authority.",
    applicabilityExplanation:
      "The school register and children's-group provider register are separate. ACE branding, a Learning Centre label and the portal screen set do not establish legal school status or funding.",
    unknownExplanation:
      "Record ages, educational programme, care hours, founder, funding, premises and region; ask the competent authority where classification is uncertain.",
    expectedEvidence: [
      "Provision assessment and written regional education authority or Labour Office advice where classification is uncertain",
    ],
    sourceIds: [
      "cze-school-register-regional",
      "cze-school-foundation",
      "cze-child-groups",
    ],
    signalKeys: [],
  }),
  action({
    id: "cze.school-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "For an actual school or registered educational establishment, keep its school-register entry and approved scope current.",
    applicabilityExplanation:
      "Registration confers authority to provide education and issue documents within the recorded scope. The competent regional or ministry route depends on school type and founder, not an ACE or public-facing product label.",
    unknownExplanation:
      "Confirm legal school status, founder, programme, region and the competent register authority before deciding the route does not apply.",
    expectedEvidence: [
      "Current register entry, founder/entity documents, approved programmes and change correspondence",
    ],
    sourceIds: [
      "cze-school-register-regional",
      "cze-school-register-ministry",
      "cze-school-foundation",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document actual provision and confirm non-school status with the regional education authority when uncertain.",
  }),
  action({
    id: "cze.children-group-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Determine whether the care service is an ordinary or neighbourhood children's group, kindergarten, or another provision type, then obtain the applicable authorisation.",
    applicabilityExplanation:
      "The Labour Office says a children's-group provider's authorisation arises on entry in its register. A childcare flag alone cannot distinguish a children's group from a registered kindergarten or other care.",
    unknownExplanation:
      "Confirm ages, care pattern, provider, premises and competent authority; ask the Labour Office or regional education authority before dismissing the route.",
    expectedEvidence: [
      "Classification advice, provider-register entry or school-register entry, and current operating conditions",
    ],
    sourceIds: [
      "cze-child-groups",
      "cze-neighbourhood-groups",
      "cze-school-register-regional",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the actual service is outside both children's-group and school-register routes and check with the competent authority.",
  }),
  action({
    id: "cze.child-protection",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain child-protection reporting procedures, a named contact and secure concern records for child-facing provision.",
    applicabilityExplanation:
      "Ministry school materials address suspected abuse, neglect and bullying, including referral to child-protection authorities and police. The exact institutional duty depends on legal provider type.",
    unknownExplanation:
      "Confirm the relevant OSPOD, police and school or care authority contacts and any mandatory notification route.",
    expectedEvidence: [
      "Safeguarding procedure, staff briefing, local referral contacts and restricted concern records",
    ],
    sourceIds: ["cze-child-protection"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "cze.role-qualifications",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: { any: [school, care] },
    action:
      "Verify role-specific pedagogical or children's-group qualifications, suitability and required training before assigning child-facing work.",
    applicabilityExplanation:
      "Ministry qualification routes apply to regulated pedagogical roles; Labour Office guidance sets different conditions for children's-group carers and neighbourhood providers. An adult portal account alone is not a staff role.",
    unknownExplanation:
      "Identify each actual role, legal provider type and qualification route before deciding which checks apply.",
    expectedEvidence: [
      "Role assessment, verified qualifications, required suitability documents, training and review dates",
    ],
    sourceIds: [
      "cze-staff-qualification",
      "cze-child-groups",
      "cze-neighbourhood-groups",
    ],
    signalKeys: ["personnel"],
  }),
  action({
    id: "cze.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, health, safeguarding and staff data and identify the site's controller or processor role.",
    applicabilityExplanation:
      "GDPR duties follow actual processing and role. The Czech data-protection authority explains controller, processor and risk-based requirements.",
    unknownExplanation:
      "Identify purposes, recipients, processors and whether record, breach, DPIA or DPO obligations apply.",
    expectedEvidence: [
      "Processing map, controller decisions and documented conditional-duty assessment",
    ],
    sourceIds: ["cze-privacy-guide", "cze-gdpr"],
    signalKeys: [],
  }),
  action({
    id: "cze.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and security for personal data controlled by the site.",
    applicabilityExplanation:
      "GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; health and other special-category data require an Article 9 condition.",
    unknownExplanation:
      "Confirm the controller role, data categories, lawful bases and Czech implementation before marking this inapplicable.",
    expectedEvidence: [
      "Lawful-basis record, privacy notices, retention schedule, security and special-category assessment",
    ],
    sourceIds: ["cze-gdpr", "cze-privacy-guide"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "cze.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Identify and assess work risks and implement appropriate employee safety measures.",
    applicabilityExplanation:
      "The Czech labour inspectorate describes Labour Code sections 101–108 and the employer's duty to protect workers in light of workplace risks.",
    unknownExplanation:
      "Confirm employer status, shared premises, actual tasks and the people affected.",
    expectedEvidence: [
      "Risk assessment, preventive measures, staff briefing and responsible person",
    ],
    sourceIds: ["cze-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "cze.local-premises",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check building use, fire and hygiene approvals with the region and municipality for the actual school, care or other service.",
    applicabilityExplanation:
      "School-register and children's-group applications require provider-specific premises evidence. Requirements vary by activity and place; the national catalogue does not settle local permissions.",
    unknownExplanation:
      "Record the municipality, region, building use, owner responsibilities and service type before dismissing a permission.",
    expectedEvidence: [
      "Building-use, fire and hygiene approvals or written authority advice applicable to the site",
    ],
    sourceIds: ["cze-school-register-regional", "cze-child-groups"],
    signalKeys: [],
  }),
  action({
    id: "cze.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Match the school's educational programme, pupil records and absence procedures to its registered type and current ministry framework.",
    applicabilityExplanation:
      "Ministry programme and 2026 attendance recommendations concern specified registered school types; transitional rules and age-specific duties need school-level confirmation.",
    unknownExplanation:
      "Check the registered programme, pupil ages, current curriculum transition and applicable attendance process.",
    expectedEvidence: [
      "School programme, register-approved scope, pupil and absence procedures",
    ],
    sourceIds: ["cze-curriculum", "cze-attendance"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "cze.care-operations",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Match child numbers, carer roles, parent information and care procedures to the approved care category.",
    applicabilityExplanation:
      "Labour Office guidance distinguishes ordinary and neighbourhood children's groups, while registered kindergartens use the school route. A fixed ratio cannot safely be inferred from the portal childcare flag.",
    unknownExplanation:
      "Confirm the actual provider register, child ages, capacity and regional hygiene conditions.",
    expectedEvidence: [
      "Authorised capacity, care plan, parent information, staffing and inspection records",
    ],
    sourceIds: ["cze-child-groups", "cze-neighbourhood-groups"],
    signalKeys: ["personnel", "medical"],
  }),
  action({
    id: "cze.food-route",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Notify the competent Czech food authority of in-scope food-business activity and maintain proportionate hygiene procedures.",
    applicabilityExplanation:
      "Regulation (EC) 852/2004 requires food-business establishment notification and hygiene controls; Czech authority and specialist approvals depend on actual food handling.",
    unknownExplanation:
      "Identify preparation, supply, school catering and competent inspection authority before selecting the notification route.",
    expectedEvidence: [
      "Food-business notification or authority decision and HACCP-based hygiene records",
    ],
    sourceIds: ["cze-food-notification", "cze-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "cze.trip-planning",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site supervision, transport, permissions and emergency response, then check the registered provider's regional requirements.",
    applicabilityExplanation:
      "School prevention and workplace-safety material support risk-led planning; specific trip and transport duties remain under review.",
    unknownExplanation:
      "Record destination, ages, organiser, staff roles and vehicle arrangements; seek competent authority advice when uncertain.",
    expectedEvidence: [
      "Visit risk plan, permissions, emergency contacts and relevant authority advice",
    ],
    sourceIds: ["cze-child-protection", "cze-work-safety"],
    signalKeys: ["trips"],
  }),
  action({
    id: "cze.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal evidence when the site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is separate from ACE branding and Czech school recognition; portal data does not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["cze-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "cze.icce-academic",
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
    sourceIds: ["cze-icce-enrolment", "cze-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
