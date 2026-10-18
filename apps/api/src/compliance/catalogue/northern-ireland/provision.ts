import type { CatalogueRequirement } from "../schema";
import { northernIrelandRequirement as action } from "./shared";

const school: CatalogueRequirement["condition"] = {
  any: [
    { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
    { field: "providerCategory", op: "eq", value: "INDEPENDENT_SCHOOL" },
  ],
};
const state = {
  field: "providerCategory",
  op: "eq",
  value: "STATE_SCHOOL",
} as const;
const childcare = { field: "childcare", op: "eq", value: true } as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const vehicles = { field: "operatesVehicles", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const provisionRequirements: CatalogueRequirement[] = [
  action({
    id: "nir.school-attendance",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review attendance recording and absence-code procedures against current Northern Ireland guidance.",
    applicabilityExplanation:
      "The 2026/27 guidance changes codes for schools; confirm whether and how an independent school uses the route.",
    unknownExplanation:
      "Confirm actual school status and the current academic-year recording arrangement.",
    expectedEvidence: [
      "Attendance policy, coding instructions and response to absence",
    ],
    sourceIds: ["nir-attendance"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "nir.sen-code",
    topic: "education_childcare",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    action:
      "Review the school's special educational needs process against the operative code and supplement.",
    applicabilityExplanation:
      "The published code applies to schools and education bodies within their respective responsibilities; a draft replacement is not treated as current.",
    unknownExplanation:
      "Confirm school status, responsible authority and any specific SEN duties for the setting.",
    expectedEvidence: [
      "Identification, support-planning and review routes, plus family communication",
    ],
    sourceIds: ["nir-sen"],
    signalKeys: [],
  }),
  action({
    id: "nir.state-curriculum",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: state,
    action:
      "Confirm the school's applicable statutory curriculum and current phase-specific provision.",
    applicabilityExplanation:
      "The statutory curriculum route applies to schools within its legal scope; independent-school registration has separate standards and is not inferred from product type.",
    unknownExplanation:
      "Confirm actual school status, phase and the responsible authority's curriculum requirements.",
    expectedEvidence: ["Curriculum map and phase-specific review"],
    sourceIds: ["nir-curriculum"],
    signalKeys: [],
  }),
  action({
    id: "nir.childcare-standards",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: childcare,
    action:
      "Check registered childcare provision against HSC Trust conditions and current under-12 minimum standards.",
    applicabilityExplanation:
      "Standards and conditions follow actual registered childcare; an out-of-school teaching centre without registrable care is not automatically covered.",
    unknownExplanation:
      "Confirm under-12 care, hours, registration, conditions and the responsible HSC Trust.",
    expectedEvidence: [
      "Registration conditions, staffing/ratio assessment and inspection responses",
    ],
    sourceIds: ["nir-childcare-registration", "nir-childcare-standards"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only after recording a justified non-registrable classification, with HSC Trust advice where uncertain.",
  }),
  action({
    id: "nir.food-registration",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Register the food-business establishment with the Northern Ireland district council before operations start.",
    applicabilityExplanation:
      "The duty applies when actual food activity is a food business, not every snack or parent-provided meal.",
    unknownExplanation:
      "Establish food-business status and the responsible district council.",
    expectedEvidence: ["Food-business assessment and council registration"],
    sourceIds: ["nir-food-registration"],
    signalKeys: [],
  }),
  action({
    id: "nir.food-safety",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Maintain food-safety management and hygiene controls appropriate to in-scope food activities.",
    applicabilityExplanation:
      "Procedures must fit the confirmed food business and its preparation, handling and service risks.",
    unknownExplanation:
      "Confirm whether food operations are in scope and what activities are performed.",
    expectedEvidence: ["Food-safety plan, training and monitoring records"],
    sourceIds: ["nir-food-hygiene", "nir-food-haccp"],
    signalKeys: [],
  }),
  action({
    id: "nir.trip-risk",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site visits with proportionate risk, supervision and emergency arrangements.",
    applicabilityExplanation:
      "Trip controls follow actual activities and employer duties; there is no universal trip certificate.",
    unknownExplanation:
      "Identify visits, participants and who operates any transport.",
    expectedEvidence: [
      "Visit plan, risk decisions, permissions and emergency contacts",
    ],
    sourceIds: ["nir-trips"],
    signalKeys: ["trips"],
  }),
  action({
    id: "nir.transport-route",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: vehicles,
    action:
      "Confirm the applicable Northern Ireland operator, vehicle and driver permissions for own passenger transport.",
    applicabilityExplanation:
      "Permits and licences depend on operation and vehicle use; contracted transport does not make the institution the operator.",
    unknownExplanation:
      "Confirm who operates vehicles and obtain DVA advice on the applicable NI permit or licensing route.",
    expectedEvidence: [
      "Operator decision, licensing advice, vehicle and driver checks",
    ],
    sourceIds: ["nir-transport"],
    signalKeys: [],
  }),
  action({
    id: "nir.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain applicable ICCE provider registration and renewal evidence.",
    applicabilityExplanation:
      "ICCE applies only to institutions offering ICCE qualifications; ACE branding alone is insufficient.",
    unknownExplanation:
      "Confirm ICCE participation and current entity-specific agreement.",
    expectedEvidence: ["Provider registration and renewal correspondence"],
    sourceIds: ["nir-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "nir.icce-academic",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep ICCE enrolments, academic projections and required moderation current.",
    applicabilityExplanation:
      "Provider terms depend on offered qualifications; portal evidence never implies external approval.",
    unknownExplanation:
      "Confirm actual enrolments, qualifications and provider-approved schedules.",
    expectedEvidence: [
      "Enrolment acknowledgements, approved projections and moderation records",
    ],
    sourceIds: ["nir-icce-enrolment", "nir-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
