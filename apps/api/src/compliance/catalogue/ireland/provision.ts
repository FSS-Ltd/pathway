import type { CatalogueRequirement } from "../schema";
import { irelandCareCondition, irelandRequirement as action } from "./shared";

const recognised = {
  field: "providerCategory",
  op: "eq",
  value: "STATE_SCHOOL",
} as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const provisionRequirements: CatalogueRequirement[] = [
  action({
    id: "irl.recognised-curriculum",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: recognised,
    action:
      "Map the school's current primary curriculum and implementation timetable where it is a recognised primary or special school.",
    applicabilityExplanation:
      "Department curriculum guidance is for recognised schools and is being phased; independent or non-recognised provision cannot be inferred to follow that route.",
    unknownExplanation:
      "Confirm recognition, educational phase and the department's current implementation schedule.",
    expectedEvidence: [
      "Recognition and phase assessment, curriculum map and implementation review",
    ],
    sourceIds: ["irl-primary-curriculum"],
    signalKeys: [],
  }),
  action({
    id: "irl.registered-care-standards",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: irelandCareCondition,
    action:
      "Operate registered early-years or school-age childcare within Tusla conditions and applicable service standards.",
    applicabilityExplanation:
      "The exact regulations and staffing conditions depend on the registered service type, not an ACE or Learning Centre label.",
    unknownExplanation:
      "Confirm service registration, age group, certificate and current Tusla conditions.",
    expectedEvidence: [
      "Registration certificate, service-standard checklist, staffing records and inspection response",
    ],
    sourceIds: [
      "irl-early-years-care",
      "irl-school-age-care",
      "irl-care-standards",
    ],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Only where documented facts and Tusla advice establish that no registered childcare service is provided.",
  }),
  action({
    id: "irl.food-registration",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Register an in-scope food business with the appropriate Irish competent authority before operating.",
    applicabilityExplanation:
      "The route depends on actual food business activity and may use HSE environmental health or another authority for particular foods.",
    unknownExplanation:
      "Confirm food-business status, handling activities and the competent registering authority.",
    expectedEvidence: [
      "Business classification, authority registration and premises details",
    ],
    sourceIds: ["irl-food-register"],
    signalKeys: [],
  }),
  action({
    id: "irl.food-safety",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Maintain food-safety procedures based on HACCP principles appropriate to the site's food operations.",
    applicabilityExplanation:
      "Regulation 852/2004 applies to in-scope food business operators, with procedures proportionate to their actual activity.",
    unknownExplanation:
      "Confirm food-business status and preparation, handling or distribution activities.",
    expectedEvidence: [
      "Food-safety management plan, monitoring and staff training",
    ],
    sourceIds: ["irl-food-haccp"],
    signalKeys: [],
  }),
  action({
    id: "irl.trip-risk",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site visits with proportionate risk, supervision, consent and emergency arrangements.",
    applicabilityExplanation:
      "The safety statement should include actual off-site activities; there is no universal trip certificate in this national core.",
    unknownExplanation:
      "Identify trips, participants, transport and the responsible organiser.",
    expectedEvidence: [
      "Visit plan, risk assessment, permissions and emergency contacts",
    ],
    sourceIds: ["irl-risk"],
    signalKeys: ["trips"],
  }),
  action({
    id: "irl.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain the applicable ICCE provider registration and renewal evidence.",
    applicabilityExplanation:
      "ICCE provider requirements apply only if the institution offers ICCE qualifications, regardless of ACE branding.",
    unknownExplanation:
      "Confirm ICCE participation and the current entity-specific provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["irl-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "irl.icce-academic",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep ICCE student enrolment, approved projections and moderation evidence current.",
    applicabilityExplanation:
      "Provider terms follow actual qualifications and enrolments; portal evidence does not imply external approval.",
    unknownExplanation:
      "Confirm offered qualifications, enrolments and provider-approved schedule.",
    expectedEvidence: [
      "Enrolment acknowledgements, approved projections and moderation records",
    ],
    sourceIds: ["irl-icce-enrolment", "irl-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
