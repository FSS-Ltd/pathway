import type { CatalogueRequirement } from "../schema";
import { greeceRequirement as action, privateSchool } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const boarding = { field: "boarding", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const greeceOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "grc.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data processing and identify controllers and processors.",
    applicabilityExplanation:
      "GDPR follows actual processing; a signed agreement is not itself a lawful basis for every purpose.",
    unknownExplanation:
      "Record purposes, recipients, special-category data, retention and service-provider roles.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["grc-gdpr", "grc-dpa-children"],
    signalKeys: [],
  }),
  action({
    id: "grc.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, notices, retention, rights handling, access controls and breach response for personal data this site controls.",
    applicabilityExplanation:
      "Controller duties follow GDPR and Greek supervisory guidance; DPO, DPIA and notification need their own trigger assessments.",
    unknownExplanation:
      "Confirm controller status, sensitive-data uses, risk profile and the Hellenic DPA's current process.",
    expectedEvidence: [
      "Lawful-basis record, notices, retention schedule, rights procedure and breach plan",
    ],
    sourceIds: ["grc-gdpr", "grc-dpa-children", "grc-dpa-breach"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "grc.work-risk-assessment",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Prepare and maintain the written occupational risk assessment and protective measures for employees.",
    applicabilityExplanation:
      "The employer remains responsible under Law 3850/2010; using a safety technician or occupational physician does not transfer that responsibility.",
    unknownExplanation:
      "Confirm employment arrangements, workplaces, hazards and responsible professionals.",
    expectedEvidence: [
      "Current written occupational risk assessment and protective-action record",
    ],
    sourceIds: ["grc-work-risk"],
    signalKeys: [],
  }),
  action({
    id: "grc.premises-route",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Confirm building use, fire protection, accessibility and local health conditions for the actual licensed activity and premises.",
    applicabilityExplanation:
      "Private schools, tuition/language centres, preschool units and KDAP have different premises evidence and inspection routes; leasing or sharing a building does not prove those conditions are met.",
    unknownExplanation:
      "Record the actual site, control and licence category; obtain the competent fire, building, municipal or regional authority's conditions.",
    expectedEvidence: [
      "Building-use and fire documents, accessibility review, inspection or shared-premises responsibility record",
    ],
    sourceIds: [
      "grc-private-school-licence",
      "grc-private-school-natural-person",
      "grc-tutoring-notification",
      "grc-tutoring-legal-entity-notification",
      "grc-preschool-licence",
      "grc-creative-centre-licence",
    ],
    signalKeys: [],
  }),
  action({
    id: "grc.food-hygiene",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, maintain the applicable food-hygiene procedures and trained responsibilities.",
    applicabilityExplanation:
      "EU food-business rules follow preparation and supply activity; a school label or occasional event alone does not settle operator status.",
    unknownExplanation:
      "Confirm food operator, activity, frequency, premises and competent food-control authority.",
    expectedEvidence: [
      "Food-activity classification, hygiene procedures, staff instruction and inspection records",
    ],
    sourceIds: ["grc-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "grc.school-canteen",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { all: [privateSchool, food] },
    action:
      "If the site operates a school canteen, catering point or vending facility, review the current Greek school-food hygiene and product rules.",
    applicabilityExplanation:
      "The 2026 health-ministry rules are activity-specific and should not be applied to a school with no food service.",
    unknownExplanation:
      "Confirm food-service model, operator and the current school-canteen decision with the health authority.",
    expectedEvidence: [
      "School-food operating assessment, permitted-product list and hygiene inspection record",
    ],
    sourceIds: ["grc-school-canteen", "grc-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual food operation is outside the school-canteen rules and confirm unclear cases with local food control.",
  }),
  action({
    id: "grc.camp-classification",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { any: [trips, boarding] },
    action:
      "Determine whether organised stays or camps require a separate Greek camp licence, child-protection route and local safety conditions.",
    applicabilityExplanation:
      "An ordinary day trip is not automatically a licensed camp; an overnight or organised camp may be.",
    unknownExplanation:
      "Record duration, accommodation, operator, ages and region before choosing a camp route.",
    expectedEvidence: [
      "Activity assessment, camp licence or written authority classification, trip permissions and safety plan",
    ],
    sourceIds: ["grc-camp-licence", "grc-child-protection-scope"],
    signalKeys: ["trips", "safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the activity is not a regulated camp and check uncertain cases with the regional licensing authority.",
  }),
  action({
    id: "grc.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal for qualifications actually offered.",
    applicabilityExplanation:
      "ICCE terms apply only to participating providers; ACE branding and Greek school approval do not establish ICCE participation or qualification recognition.",
    unknownExplanation:
      "Confirm whether ICCE qualifications are offered and whether Greek recognition is relevant.",
    expectedEvidence: ["Current ICCE registration and renewal correspondence"],
    sourceIds: ["grc-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "grc.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Check ICCE student enrolment, approved academic projections and moderation for qualifications actually offered.",
    applicabilityExplanation:
      "These are provider requirements for actual ICCE participants, separate from Greek education licensing.",
    unknownExplanation:
      "Confirm participating students, level, projections and moderation cycle.",
    expectedEvidence: ["Enrolment, approved projection and moderation records"],
    sourceIds: ["grc-icce-enrolment", "grc-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
