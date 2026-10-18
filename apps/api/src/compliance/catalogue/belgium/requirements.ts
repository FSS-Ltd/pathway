import type { CatalogueRequirement } from "../schema";
import { belgiumRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const care: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
  ],
};
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const belgiumRequirements: CatalogueRequirement[] = [
  action({
    id: "bel.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the actual provision, responsible language Community and Region, and ask the competent authority which school or care route applies.",
    applicabilityExplanation:
      "Belgian education and relevant care powers are split between language Communities. ACE status, funding and portal screens do not decide legal recognition.",
    unknownExplanation:
      "Confirm language Community, premises Region, ages, hours, curriculum, care activities and school recognition before deciding a route.",
    expectedEvidence: [
      "Provider classification and competent Community/Region authority correspondence",
    ],
    sourceIds: [
      "bel-communities",
      "bel-education",
      "bel-flanders-recognition",
      "bel-german-school",
    ],
    signalKeys: [],
  }),
  action({
    id: "bel.child-protection-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Confirm the applicable Community child-protection reporting route and maintain a site procedure for responding to concerns.",
    applicabilityExplanation:
      "Youth protection and education responsibilities differ by Community; this national action does not substitute for the applicable Community's reporting rule.",
    unknownExplanation:
      "Identify actual child-facing provision, competent Community and local safeguarding authority.",
    expectedEvidence: [
      "Community authority advice, safeguarding procedure, responsible contacts and review record",
    ],
    sourceIds: ["bel-communities"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "bel.child-facing-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess child-facing roles and record when a Model 596-2 criminal-record extract is required for the role.",
    applicabilityExplanation:
      "Federal Justice identifies Model 596-2 for education and supervision involving minors. A parent or adult portal login alone is not a child-facing role.",
    unknownExplanation:
      "Record duties, contact with minors, Community-specific hiring rules and the competent authority's decision.",
    expectedEvidence: [
      "Role assessment, applicable extract verification and organisation review date",
    ],
    sourceIds: ["bel-child-extract"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "bel.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map site data processing and document who is controller or processor for pupil, health, staff and family records.",
    applicabilityExplanation:
      "EU GDPR responsibilities depend on actual processing and decision-making, not the selected sector or screen set.",
    unknownExplanation:
      "Identify processing purposes, recipients, contracts and special-category data before excluding controller duties.",
    expectedEvidence: [
      "Processing map, controller decisions and processor contracts",
    ],
    sourceIds: ["bel-gdpr", "bel-privacy-school"],
    signalKeys: [],
  }),
  action({
    id: "bel.privacy-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention and risk-based security for the site's personal data.",
    applicabilityExplanation:
      "EU GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; health and other special-category data need a separate Article 9 condition.",
    unknownExplanation:
      "Confirm controller role, purposes, collection routes, data categories and actual legal bases.",
    expectedEvidence: [
      "Lawful-basis register, versioned notices, retention schedule, security and special-category review",
    ],
    sourceIds: ["bel-gdpr", "bel-privacy-school"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "bel.workplace-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess workplace hazards and maintain prevention measures for staff, including fire risk.",
    applicabilityExplanation:
      "Belgian employer workplace-welfare duties are risk-based; regional building permissions remain a separate review.",
    unknownExplanation:
      "Confirm employing entity, workforce, shared premises and actual work activities.",
    expectedEvidence: [
      "Workplace and fire risk assessment, controls and review record",
    ],
    sourceIds: ["bel-work-risk", "bel-work-fire"],
    signalKeys: [],
  }),
  action({
    id: "bel.workplace-firstaid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Provide first-aid arrangements suitable for workforce size and risks, with designated, trained people as required.",
    applicabilityExplanation:
      "Employer first-aid arrangements vary by risk and workforce group; no universal certificate expiry is asserted.",
    unknownExplanation:
      "Confirm staff count, risk group, activities and employer first-aid assessment.",
    expectedEvidence: [
      "First-aid assessment, available equipment and role-appropriate training records",
    ],
    sourceIds: ["bel-work-firstaid"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "bel.school-community-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Confirm school recognition, compulsory-education treatment, curriculum and inspection conditions with the responsible Community.",
    applicabilityExplanation:
      "Recognition and funding are separate. Flemish unrecognised-school attendance can follow home-education rules; that family duty must not be presented as a universal provider registration.",
    unknownExplanation:
      "Confirm the language Community, legal school status, pupil ages and applicable recognition route.",
    expectedEvidence: [
      "Community classification, recognition or documented exception, family information and authority correspondence",
    ],
    sourceIds: [
      "bel-education",
      "bel-flanders-recognition",
      "bel-german-school",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "bel.childcare-community-route",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Confirm childcare authorisation, staffing, safety and inspection requirements with the competent Community before offering care.",
    applicabilityExplanation:
      "Opgroeien and ONE describe different Community licensing routes; neither is automatically applied to every Belgian site.",
    unknownExplanation:
      "Confirm Community, Region, service type, ages and hours; Brussels may require a specific authority choice.",
    expectedEvidence: [
      "Community licence or documented exception, staffing conditions and regulator correspondence",
    ],
    sourceIds: ["bel-flanders-care", "bel-french-care", "bel-communities"],
    signalKeys: ["personnel", "safeguarding"],
  }),
  action({
    id: "bel.food-route",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Confirm the food-chain activity's FAVV/AFSCA registration, authorisation or approval and maintain proportionate HACCP-based controls.",
    applicabilityExplanation:
      "The required route depends on actual food operations and risk; EU hygiene rules apply to in-scope food businesses.",
    unknownExplanation:
      "Identify actual food activities, establishment and any exception with the local control unit.",
    expectedEvidence: [
      "FAVV/AFSCA activity registration or permission and food-safety procedures",
    ],
    sourceIds: ["bel-food", "bel-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "bel.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal evidence when this site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is independent of ACE branding and Belgian school recognition; portal records do not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["bel-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "bel.icce-academic",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep ICCE enrolment, approved academic projections and moderation evidence current.",
    applicabilityExplanation:
      "Provider terms follow actual ICCE offerings and enrolled students, not the chosen portal vertical.",
    unknownExplanation:
      "Confirm qualifications, students and provider-approved timetable.",
    expectedEvidence: [
      "Enrolment acknowledgements, approved projections and moderation records",
    ],
    sourceIds: ["bel-icce-enrolment", "bel-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
