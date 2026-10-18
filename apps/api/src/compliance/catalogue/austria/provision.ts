import type { CatalogueRequirement } from "../schema";
import { austriaRequirement as action } from "./shared";

const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const provisionRequirements: CatalogueRequirement[] = [
  action({
    id: "aut.food-registration-hygiene",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "Notify the competent authority of an in-scope food establishment and maintain proportionate HACCP-based hygiene procedures.",
    applicabilityExplanation:
      "Regulation (EC) 852/2004 Articles 5 and 6 depend on actual food-business operations; specialist approval and Land enforcement need separate review.",
    unknownExplanation:
      "Confirm whether food is handled as a business, the activity and the competent Austrian authority.",
    expectedEvidence: [
      "Food-business classification, notification/registration and food-safety plan",
    ],
    sourceIds: ["aut-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "aut.trip-risk",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: trips,
    action:
      "Plan off-site activities with proportionate supervision, transport, consent and emergency arrangements.",
    applicabilityExplanation:
      "Employer workplace evaluation covers staff risks, while youth protection and school trip rules vary by Land and provider type.",
    unknownExplanation:
      "Identify activity, ages, destination, transport, responsible organiser and Land-specific rules.",
    expectedEvidence: [
      "Visit plan, risk assessment, permissions and emergency contacts",
    ],
    sourceIds: ["aut-work-risk", "aut-youth-supervision"],
    signalKeys: ["trips"],
  }),
  action({
    id: "aut.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain applicable ICCE provider registration and renewal evidence where the site actually offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is independent of ACE branding or Austrian private-school status; portal records do not prove external approval.",
    unknownExplanation:
      "Confirm offered qualifications and current provider agreement.",
    expectedEvidence: ["ICCE registration and renewal correspondence"],
    sourceIds: ["aut-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "aut.icce-academic",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep ICCE student enrolment, approved projections and moderation evidence current.",
    applicabilityExplanation:
      "Provider requirements follow actual ICCE qualifications and enrolled students, not the chosen screen set.",
    unknownExplanation:
      "Confirm qualifications, students and the provider-approved schedule.",
    expectedEvidence: [
      "Enrolment acknowledgements, approved projections and moderation records",
    ],
    sourceIds: ["aut-icce-enrolment", "aut-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
