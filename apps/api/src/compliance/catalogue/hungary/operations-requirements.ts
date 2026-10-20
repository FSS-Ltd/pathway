import type { CatalogueRequirement } from "../schema";
import { hungaryRequirement as action, outOfSchool } from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const boarding = { field: "boarding", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const hungaryOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "hun.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data processing and identify controllers and processors.",
    applicabilityExplanation:
      "GDPR follows actual processing; signing a portal agreement is not itself a lawful basis for every use.",
    unknownExplanation:
      "Record purposes, special-category data, recipients, service providers and retention decisions.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["hun-gdpr", "hun-naih-dpia"],
    signalKeys: [],
  }),
  action({
    id: "hun.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, notices, retention, rights handling, access controls and breach response for data this site controls.",
    applicabilityExplanation:
      "Controller duties follow GDPR; a DPO, DPIA or NAIH breach report is required only when its own trigger is met.",
    unknownExplanation:
      "Confirm controller status, sensitive-data uses, risk profile and NAIH procedure.",
    expectedEvidence: [
      "Lawful-basis record, privacy notices, retention schedule, rights procedure and breach plan",
    ],
    sourceIds: ["hun-gdpr", "hun-naih-breach", "hun-naih-dpia"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "hun.dpia-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether a DPIA or DPO is required for the site's actual child, health, biometric or large-scale processing.",
    applicabilityExplanation:
      "NAIH's mandatory-DPIA list includes specified high-risk uses; merely holding an allergy field does not establish every trigger.",
    unknownExplanation:
      "Confirm the nature, scale, vulnerability and technology of processing against current NAIH and GDPR criteria.",
    expectedEvidence: [
      "DPIA/DPO trigger assessment and completed documentation if required",
    ],
    sourceIds: ["hun-gdpr", "hun-naih-dpia"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the assessed reason no DPIA/DPO trigger applies and revisit after material processing changes; seek NAIH advice if uncertain.",
  }),
  action({
    id: "hun.work-risk-assessment",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Maintain the employer's occupational risk assessment and protective measures for staff work.",
    applicabilityExplanation:
      "Act XCIII/1993 requires employer risk assessment before activity and review following specified changes; a portal annual reminder is not its statutory interval.",
    unknownExplanation:
      "Confirm workforce, workplaces, hazards, responsible professionals and the current review trigger.",
    expectedEvidence: [
      "Written occupational risk assessment, protective-action record and review date",
    ],
    sourceIds: ["hun-work-safety-act"],
    signalKeys: [],
  }),
  action({
    id: "hun.premises-and-health",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Confirm site-specific building, fire, public-health, accessibility and first-aid conditions for the actual education or care service.",
    applicabilityExplanation:
      "Non-state school permissions examine premises and safety; public-health duties depend on activity and site. Shared premises require a clear responsibility record.",
    unknownExplanation:
      "Confirm licensed service, building use, controlling party and local education, fire and health authority requirements.",
    expectedEvidence: [
      "Building-use documents, fire/health inspection records, accessibility and first-aid arrangements",
    ],
    sourceIds: [
      "hun-education-decree",
      "hun-health-act",
      "hun-work-safety-act",
    ],
    signalKeys: [],
  }),
  action({
    id: "hun.training-records",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "If organised training falls within the adult-training law, check learner contracts, programme and reporting/record duties for the actual route.",
    applicabilityExplanation:
      "Training obligations differ between a declaration, conditional permit and a statutory exclusion; a non-ACE Learning Centre is not assumed to be state funded.",
    unknownExplanation:
      "Confirm the currently competent authority's scope decision, training form, learner ages and any funding or certificate conditions.",
    expectedEvidence: [
      "Training scope decision, programme, learner contract and required reporting records",
    ],
    sourceIds: ["hun-adult-training-act"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the specific statutory exclusion or why organised training does not occur and confirm uncertain cases with the current training authority.",
  }),
  action({
    id: "hun.food-hygiene",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, maintain applicable food-hygiene procedures and trained responsibilities.",
    applicabilityExplanation:
      "EU food-business duties follow preparation or supply activity, not merely a school or nursery label.",
    unknownExplanation:
      "Confirm food operator, frequency, premises and competent food-control authority.",
    expectedEvidence: [
      "Food-activity classification, hygiene procedures, staff instruction and inspection records",
    ],
    sourceIds: ["hun-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "hun.trips-and-boarding",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { any: [trips, boarding] },
    action:
      "Review risk, consent, supervision, transport and any residential or camp permission for organised trips or boarding actually provided.",
    applicabilityExplanation:
      "A day visit is not automatically a boarding service; activity-specific child welfare and health conditions need local classification.",
    unknownExplanation:
      "Record duration, overnight care, vehicles, operator, ages and county/local authority advice.",
    expectedEvidence: [
      "Activity risk assessment, parent permissions, supervision plan and authority classification if residential",
    ],
    sourceIds: ["hun-child-welfare-act", "hun-health-act"],
    signalKeys: ["trips", "safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the specific residential or camp route is outside scope and confirm uncertainty with the county child-welfare authority.",
  }),
  action({
    id: "hun.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration, training and renewal for qualifications actually offered.",
    applicabilityExplanation:
      "ICCE terms apply only to participants; ACE branding and Hungarian school permission do not establish ICCE registration or Hungarian recognition.",
    unknownExplanation:
      "Confirm whether ICCE qualifications are offered and whether Hungarian qualification recognition is relevant.",
    expectedEvidence: ["Current ICCE registration and renewal correspondence"],
    sourceIds: ["hun-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "hun.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Check ICCE student enrolment, approved academic projections and moderation for qualifications actually offered.",
    applicabilityExplanation:
      "These are ICCE provider requirements for actual participants, separate from Hungarian education licensing.",
    unknownExplanation:
      "Confirm participating students, level, projections and moderation cycle.",
    expectedEvidence: ["Enrolment, approved projection and moderation records"],
    sourceIds: ["hun-icce-enrolment", "hun-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
