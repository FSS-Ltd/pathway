import type { CatalogueRequirement } from "../schema";
import {
  care,
  children,
  formalEducation,
  latviaRequirement as action,
  municipality,
} from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const foodBusiness = { field: "foodBusiness", op: "eq", value: true } as const;
const trips = { field: "trips", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const latviaOperationalRequirements: CatalogueRequirement[] = [
  action({
    id: "lva.association-status",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "Confirm whether the operator is a registered Latvian association or foundation and keep its legal identity and governance records current.",
    applicabilityExplanation:
      "Selecting charity in Nexsteps does not create Latvian association, foundation or public-benefit status.",
    unknownExplanation:
      "Confirm legal operator, association/foundation registration and any separate public-benefit claim.",
    expectedEvidence: [
      "Enterprise Register entry, governing documents and current responsible officers",
    ],
    sourceIds: ["lva-associations", "lva-public-benefit"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the operator's other legal form and confirm unclear entity status with the Enterprise Register.",
  }),
  action({
    id: "lva.religious-status",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "sector", op: "eq", value: "CHURCH" },
    action:
      "Confirm whether the operator claims registered religious-organisation status and retain the relevant governance and institution records.",
    applicabilityExplanation:
      "A church-facing portal screen does not establish legal registration or exempt education, child-safety or premises duties.",
    unknownExplanation:
      "Confirm legal operator, congregation or other religious form and any separate educational institution.",
    expectedEvidence: [
      "Religious-organisation register entry or written legal-form assessment",
    ],
    sourceIds: ["lva-religion", "lva-institution-register"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the operator is not a registered religious organisation and confirm unclear status with the Enterprise Register.",
  }),
  action({
    id: "lva.public-benefit-status",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    action:
      "Where public-benefit status is claimed, retain the actual granted status and review its applicable activity and reporting conditions.",
    applicabilityExplanation:
      "Public-benefit status is separately granted; an association, foundation or religious organisation is not automatically a public-benefit organisation.",
    unknownExplanation:
      "Confirm legal entity, granted status, activities and competent State Revenue Service decision.",
    expectedEvidence: [
      "Public-benefit grant decision and status review, where claimed",
    ],
    sourceIds: ["lva-public-benefit"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record that no Latvian public-benefit status is claimed, and verify uncertainty with the State Revenue Service.",
  }),
  action({
    id: "lva.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding data uses and identify each controller and processor.",
    applicabilityExplanation:
      "A portal agreement or stored medical field does not itself establish every lawful basis or GDPR controller duty.",
    unknownExplanation:
      "Record purposes, special-category data, recipients, service providers, retention and controller decisions.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["lva-gdpr", "lva-school-privacy"],
    signalKeys: [],
  }),
  action({
    id: "lva.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, notices, retention, rights handling, access controls and breach response for processing this site controls.",
    applicabilityExplanation:
      "GDPR controller obligations follow actual processing; breach notification and special-category conditions depend on their legal triggers.",
    unknownExplanation:
      "Confirm controller status, categories and scale of data, rights requests and current Data State Inspectorate guidance.",
    expectedEvidence: [
      "Lawful-basis record, notices, retention schedule, rights process, access review and breach plan",
    ],
    sourceIds: ["lva-gdpr", "lva-school-privacy"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "lva.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether actual child, health, monitoring or large-scale processing triggers a DPIA or DPO requirement.",
    applicabilityExplanation:
      "GDPR DPIA and DPO rules are conditional; holding an allergy field alone does not establish every trigger.",
    unknownExplanation:
      "Confirm processing scale, categories, vulnerable people, monitoring, technology and public-body status.",
    expectedEvidence: [
      "Documented DPIA/DPO trigger assessment and completed records where required",
    ],
    sourceIds: ["lva-gdpr", "lva-school-privacy"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why neither trigger applies, revisit after material processing changes and consult the Data State Inspectorate when uncertain.",
  }),
  action({
    id: "lva.work-risk-assessment",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Maintain the employer's workplace risk assessment and protective arrangements for actual workers and activities.",
    applicabilityExplanation:
      "The Labour Protection Law applies to an employer; the portal's annual reminder is not a universal legal review date.",
    unknownExplanation:
      "Confirm workers, sites, hazards, responsible safety roles and current protective measures.",
    expectedEvidence: [
      "Workplace risk assessment, protective actions, instruction and review record",
    ],
    sourceIds: ["lva-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "lva.fire-safety",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Review site fire-safety arrangements, evacuation, equipment and instruction for the premises and actual activities.",
    applicabilityExplanation:
      "The site's premises role and educational-institution status affect exact fire duties and instruction frequency.",
    unknownExplanation:
      "Confirm controller of premises, occupancy, activities and the responsible fire-safety authority.",
    expectedEvidence: [
      "Fire-safety instructions, evacuation plan, equipment checks and relevant authority correspondence",
    ],
    sourceIds: ["lva-fire-safety", "lva-school-safety"],
    signalKeys: [],
  }),
  action({
    id: "lva.school-first-aid",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Maintain learner first-aid, preventative health and event-safety procedures for the educational institution.",
    applicabilityExplanation:
      "Regulation 474 sets education-institution learner health and first-aid arrangements; other sites need their own activity assessment.",
    unknownExplanation:
      "Confirm institution status, age range, responsible personnel, medical needs and organised events.",
    expectedEvidence: [
      "First-aid procedure, trained responsible staff, medical-needs access and incident records",
    ],
    sourceIds: ["lva-school-safety"],
    signalKeys: ["medical", "personnel"],
  }),
  action({
    id: "lva.preschool-hygiene",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "Check premises, outdoor play, cleaning, hygiene and health conditions against the actual preschool or child-supervision route.",
    applicabilityExplanation:
      "Regulation 890 covers preschool institutions and child-supervision services, with conditions that vary by service form.",
    unknownExplanation:
      "Confirm age groups, service form, site layout and Health Inspectorate conditions.",
    expectedEvidence: [
      "Premises and hygiene review, cleaning records and relevant Health Inspectorate correspondence",
    ],
    sourceIds: ["lva-preschool-hygiene", "lva-child-supervision"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why neither preschool nor child supervision operates and confirm uncertain premises scope with the Health Inspectorate.",
  }),
  action({
    id: "lva.food-business",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: foodBusiness,
    action:
      "Confirm any qualifying food establishment is registered or recognised with the Food and Veterinary Service and follows food-hygiene procedures.",
    applicabilityExplanation:
      "Food-business registration and hygiene duties follow the actual catering activity, not a school or nursery label alone.",
    unknownExplanation:
      "Confirm whether food is prepared, served or outsourced, the food operator and premises.",
    expectedEvidence: [
      "Food operator registration or recognition, supplier arrangements and hygiene procedures",
    ],
    sourceIds: ["lva-food-register", "lva-food-hygiene"],
    signalKeys: [],
  }),
  action({
    id: "lva.camp-classification",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Decide whether any organised day or overnight activity meets the children's-camp definition before applying the camp route.",
    applicabilityExplanation:
      "An ordinary trip or boarding provision is not automatically a camp; Regulation 981 depends on the actual event and participants.",
    unknownExplanation:
      "Confirm participant ages, proportion of children, programme, overnight stay and operating municipality.",
    expectedEvidence: [
      "Written activity classification and authority advice for uncertain events",
    ],
    sourceIds: ["lva-camp", "lva-atvk"],
    signalKeys: ["trips"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no event meets the camp definition and confirm doubtful cases with the operating municipality or camp authority.",
  }),
  action({
    id: "lva.camp-permissions",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [children, municipality] },
    action:
      "For an actual children's camp, verify camp-system registration, programme, leader, safety and health opinions, food registration and municipal notification.",
    applicabilityExplanation:
      "Regulation 981 has time limits and exceptions for specific opinions; it applies only when the activity is a covered camp.",
    unknownExplanation:
      "Confirm camp classification, dates, site, day or overnight type, catering and competent municipality.",
    expectedEvidence: [
      "Camp registration, programme, leader certificate, required opinions, food registration and municipal notice",
    ],
    sourceIds: ["lva-camp", "lva-atvk", "lva-food-register"],
    signalKeys: ["trips", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered camp is operated, or identify the precise statutory exception, and check it with the local authority.",
  }),
  action({
    id: "lva.school-trip-safety",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [formalEducation, trips] },
    action:
      "Apply the education-institution safety and supervision procedure to school-organised events and trips.",
    applicabilityExplanation:
      "School event duties apply even where an ordinary trip is not a registered camp.",
    unknownExplanation:
      "Confirm institution status, event type, age group, responsible staff and transport arrangements.",
    expectedEvidence: [
      "Event plan, risk review, staff responsibilities, family information and permission records",
    ],
    sourceIds: ["lva-school-safety"],
    signalKeys: ["trips", "personnel"],
  }),
  action({
    id: "lva.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep the site's ICCE provider registration, training, quality review and renewal arrangements current where it offers ICCE qualifications.",
    applicabilityExplanation:
      "ICCE participation is separate from Latvian school registration, licensing and recognition.",
    unknownExplanation:
      "Confirm the actual ICCE provider, qualification offer and current provider approval.",
    expectedEvidence: [
      "ICCE registration, training, review and renewal correspondence",
    ],
    sourceIds: ["lva-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "lva.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Review ICCE learner enrolment, approved projections and moderation evidence for actual participants.",
    applicabilityExplanation:
      "Portal ACE records can show a gap but cannot establish ICCE acceptance or Latvian qualification recognition.",
    unknownExplanation:
      "Confirm eligible learners, ICCE registration, projections and moderation period.",
    expectedEvidence: [
      "ICCE enrolment confirmations, approved projections and moderation outcomes",
    ],
    sourceIds: ["lva-icce-enrolment", "lva-icce-moderation"],
    signalKeys: ["ace", "attendance"],
  }),
];
