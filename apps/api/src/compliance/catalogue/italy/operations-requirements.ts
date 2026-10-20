import type { CatalogueRequirement } from "../schema";
import { italyRequirement as action, region, school } from "./shared";

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

export const italyOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "ita.third-sector-status",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "Confirm whether the operator claims Italian third-sector status and retain its RUNTS registration and responsible office details where applicable.",
    applicabilityExplanation:
      "A Nexsteps charity sector does not itself prove ETS registration; ordinary governance and service duties still need separate review.",
    unknownExplanation:
      "Confirm legal entity, claimed third-sector status, territorial office and applicable reporting route.",
    expectedEvidence: [
      "Entity-status decision, RUNTS entry where claimed and current office correspondence",
    ],
    sourceIds: ["ita-third-sector"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the operator does not claim ETS status and check uncertain status with the competent RUNTS office.",
  }),
  action({
    id: "ita.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, worker, health and safeguarding processing and identify controllers and processors.",
    applicabilityExplanation:
      "GDPR follows actual processing; a portal agreement is not a lawful basis for every data use.",
    unknownExplanation:
      "Record purposes, special-category data, recipients, service providers and retention decisions.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["ita-gdpr", "ita-school-privacy"],
    signalKeys: [],
  }),
  action({
    id: "ita.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, notices, retention, rights handling, access controls and breach response for data this site controls.",
    applicabilityExplanation:
      "DPO, DPIA and Garante breach notices apply only when their particular GDPR triggers are met; a medical field alone does not establish all triggers.",
    unknownExplanation:
      "Confirm controller status, sensitive-data uses, processing scale and current Garante guidance.",
    expectedEvidence: [
      "Lawful-basis record, privacy notices, retention schedule, rights procedure and breach plan",
    ],
    sourceIds: ["ita-gdpr", "ita-breach"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "ita.school-privacy",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review pupil records, health information, images, family access and digital-school services against the Garante's school guidance.",
    applicabilityExplanation:
      "School and child-health information needs proportionate access; the portal's medical record is evidence of a process, not proof that the process is compliant.",
    unknownExplanation:
      "Confirm actual records, recipients, consent where legally needed and the school's controller role.",
    expectedEvidence: [
      "School privacy notices, role access review and retention decisions",
    ],
    sourceIds: ["ita-school-privacy", "ita-gdpr"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "ita.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether the site's actual child, health, monitoring or large-scale processing triggers a DPIA or DPO requirement.",
    applicabilityExplanation:
      "The Garante's Article 35 list and GDPR criteria are conditional; merely holding an allergy field does not establish every trigger.",
    unknownExplanation:
      "Confirm data categories, scale, vulnerable people, technology and whether a public body or other DPO trigger applies.",
    expectedEvidence: [
      "Documented DPIA/DPO trigger assessment and completed records where required",
    ],
    sourceIds: ["ita-gdpr", "ita-dpia-list"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no DPIA or DPO trigger applies and revisit after material processing changes; seek Garante advice if uncertain.",
  }),
  action({
    id: "ita.work-risk-assessment",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Maintain the employer's workplace risk assessment, protective measures and role-based safety arrangements.",
    applicabilityExplanation:
      "Legislative Decree 81/2008 ties the duty to the employer and actual workplace; the portal reminder is not a statutory annual interval.",
    unknownExplanation:
      "Confirm workforce, activities, premises controller, hazards and responsible safety roles.",
    expectedEvidence: [
      "Risk-assessment document, protective actions, worker instruction and review record",
    ],
    sourceIds: ["ita-work-safety"],
    signalKeys: [],
  }),
  action({
    id: "ita.site-fire-and-first-aid",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: { all: [premises, region] },
    action:
      "Check building use, fire-prevention thresholds, evacuation, accessibility and first-aid arrangements for the actual school or care site.",
    applicabilityExplanation:
      "The fire authority identifies activity-specific thresholds; region, municipality, building use and number present determine further permissions.",
    unknownExplanation:
      "Confirm site controller, service type, occupancy, building authority and fire or health authority directions.",
    expectedEvidence: [
      "Building-use and fire decisions, evacuation plan, first-aid provision and inspection correspondence",
    ],
    sourceIds: ["ita-school-fire", "ita-work-safety", "ita-regions"],
    signalKeys: [],
  }),
  action({
    id: "ita.food-hygiene",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, maintain applicable food-hygiene procedures and trained responsibilities.",
    applicabilityExplanation:
      "EU food-business duties follow food preparation or supply activity, not merely a school or nursery label.",
    unknownExplanation:
      "Confirm food operator, service frequency, premises and competent food-control authority.",
    expectedEvidence: [
      "Food-activity classification, hygiene procedures, staff instruction and inspection records",
    ],
    sourceIds: ["ita-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "ita.trips-and-boarding",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { any: [trips, boarding] },
    action:
      "Review risk, permissions, supervision, transport and any residential or camp route for trips or boarding actually provided.",
    applicabilityExplanation:
      "A day trip is not automatically boarding; local youth, health and transport requirements depend on the activity and operator.",
    unknownExplanation:
      "Record duration, overnight care, vehicles, ages, operator and local authority advice.",
    expectedEvidence: [
      "Activity risk assessment, family permissions, supervision plan and authority classification if residential",
    ],
    sourceIds: ["ita-early-years-act", "ita-work-safety"],
    signalKeys: ["trips", "safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the specific residential, camp or transport route is outside scope and verify uncertainty with the regional or municipal authority.",
  }),
  action({
    id: "ita.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration, training and renewal for qualifications actually offered.",
    applicabilityExplanation:
      "ICCE terms apply only to participants; ACE branding or an ICCE award does not establish Italian school recognition.",
    unknownExplanation:
      "Confirm whether ICCE qualifications are offered and whether Italian qualification recognition is relevant.",
    expectedEvidence: ["Current ICCE registration and renewal correspondence"],
    sourceIds: ["ita-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "ita.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Check ICCE student enrolment, approved academic projections and moderation for qualifications actually offered.",
    applicabilityExplanation:
      "These are ICCE provider requirements for actual participants, separate from Italian education licensing.",
    unknownExplanation:
      "Confirm participating students, level, projections and moderation cycle.",
    expectedEvidence: ["Enrolment, approved projection and moderation records"],
    sourceIds: ["ita-icce-enrolment", "ita-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
