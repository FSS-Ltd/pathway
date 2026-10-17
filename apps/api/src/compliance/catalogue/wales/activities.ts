import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";
const foodBusiness = { field: "foodBusiness", op: "eq", value: true } as const;
export const activitiesRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wls-food-registration",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: foodBusiness,
    action:
      "Register a qualifying food business with the relevant Welsh local authority before operating.",
    applicabilityExplanation:
      "The duty depends on actual food-business status, not merely serving occasional food or being a charity.",
    unknownExplanation:
      "Confirm food activity and food-business classification before deciding.",
    expectedEvidence: ["Food authority registration and site/activity details"],
    sourceIds: ["wls-op-food-law-registration", "wls-op-foodregistration"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-food-safety",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: foodBusiness,
    action:
      "Apply food hygiene controls appropriate to the registered food operation.",
    applicabilityExplanation:
      "A food business needs risk-based food-safety procedures; assess the actual service and applicable exemptions.",
    unknownExplanation:
      "Confirm whether the activity is a food business and who operates it.",
    expectedEvidence: [
      "Food safety management, training and inspection records",
    ],
    sourceIds: ["wls-op-food-law-haccp", "wls-op-foodhygiene"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-food-rating-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: foodBusiness,
    action:
      "Check whether the site's Welsh food-hygiene rating must be displayed and keep the current rating visible when required.",
    applicabilityExplanation:
      "Wales mandates display for covered rated establishments, but the profile does not establish rating scheme scope or whether a rating has been issued.",
    unknownExplanation:
      "Confirm food-authority rating and display applicability.",
    expectedEvidence: ["Current rating decision and display check"],
    sourceIds: ["wls-op-foodrating"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-transport-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        { field: "transport", op: "eq", value: true },
        { field: "operatesVehicles", op: "eq", value: true },
      ],
    },
    action:
      "Review own and contracted learner transport, driver, vehicle, insurance and permit routes.",
    applicabilityExplanation:
      "Own operation and commissioned transport have different duties; nonprofit status does not itself establish permit eligibility.",
    unknownExplanation:
      "Confirm whether transport is offered and who operates vehicles.",
    expectedEvidence: [
      "Operator/contractor allocation, driver and vehicle checks, relevant licence or permit decisions",
    ],
    sourceIds: ["wls-op-transport"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wls-trip-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan and review off-site trips with risk controls and appropriate permissions.",
    applicabilityExplanation:
      "Risk and safeguarding arrangements depend on the actual trip and responsible organisation; portal permissions are supporting evidence.",
    unknownExplanation:
      "Confirm whether this site offers trips and who is responsible.",
    expectedEvidence: [
      "Trip risk plan, supervision, emergency arrangements and permission records",
    ],
    sourceIds: ["wls-op-trips"],
    signalKeys: ["trips"],
  }),
  walesRequirement({
    id: "wls-adventure-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Assess whether any offered adventure activity needs provider licensing or specialist safety arrangements.",
    applicabilityExplanation:
      "Licensing is activity- and provider-specific; trips or clubs do not automatically require an adventure licence.",
    unknownExplanation: "List actual activities, locations and operators.",
    expectedEvidence: [
      "Activity/contractor classification, applicable licence and safety review",
    ],
    sourceIds: ["wls-op-adventure"],
    signalKeys: ["trips"],
  }),
  walesRequirement({
    id: "wls-boarding-review",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "boarding", op: "eq", value: true },
    action:
      "Classify residential or boarding provision and verify the applicable Welsh CIW or school-welfare route.",
    applicabilityExplanation:
      "Boarding schools, residential special schools and children's homes can follow distinct regimes; a boarding checkbox does not prove a licence or standard.",
    unknownExplanation:
      "Confirm accommodation type, ages, duration, school category and regulator decision.",
    expectedEvidence: [
      "CIW classification, registration/inspection and accommodation safeguarding records",
    ],
    sourceIds: ["wls-op-boarding", "wls-op-schoolstandards"],
    signalKeys: [],
  }),
];
