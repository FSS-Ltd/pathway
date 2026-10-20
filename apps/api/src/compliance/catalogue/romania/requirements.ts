import type { CatalogueRequirement } from "../schema";
import {
  antePreschool,
  children,
  earlyYears,
  independentSchool,
  romaniaCountyCodes,
  romaniaRequirement as action,
  school,
} from "./shared";

const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const premises = { field: "controlsPremises", op: "eq", value: true } as const;
const food: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "foodBusiness", op: "eq", value: true },
    { field: "food", op: "eq", value: true },
  ],
};

export const romaniaRequirements: CatalogueRequirement[] = [
  action({
    id: "ro.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the actual legal operator and whether the site is an authorised school, early-childhood service, supplementary learning centre or another child-facing activity.",
    applicabilityExplanation:
      "ACE, Church, Charity and Learning Centre screens do not establish Romanian school accreditation, public funding or childcare authorisation.",
    unknownExplanation:
      "Confirm ages, teaching and care pattern, full-time status, operator, county and competent authority decisions.",
    expectedEvidence: [
      "Provider classification, operator record and authority correspondence",
    ],
    sourceIds: ["ro-education-law", "ro-creche"],
    signalKeys: [],
  }),
  action({
    id: "ro.school-authorisation",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "For an actual private or confessional pre-university school, verify provisional operating authorisation, accreditation status, approved levels and site before claiming recognised school provision.",
    applicabilityExplanation:
      "Law 198/2023 governs the actual school and its approved scope; public funding and ACE participation do not themselves determine legal status.",
    unknownExplanation:
      "Confirm legal operator, school category, educational levels, site, provisional authorisation and accreditation decisions.",
    expectedEvidence: [
      "Authorisation or accreditation decisions, approved school levels and site record",
    ],
    sourceIds: ["ro-education-law"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the provision is outside Romanian private-school authorisation and confirm an uncertain classification with the county school inspectorate or competent ministry authority.",
  }),
  ...romaniaCountyCodes.map((jurisdiction) =>
    action({
      id: `ro.county-school-route-${jurisdiction}`,
      jurisdiction,
      topic: "registration_governance",
      obligationClass: "RECOMMENDATION",
      condition: school,
      action:
        "Confirm the school's actual operating county and the competent inspectorate or local education authority for its authorisation, network and notification decisions.",
      applicabilityExplanation:
        "Eurostat identifies the county, but the NUTS code is not an operating permission or an authority decision.",
      unknownExplanation:
        "Confirm the exact municipality, school site, operator, legal category and competent county or Bucharest authority.",
      expectedEvidence: [
        "Site address, county and municipality, inspectorate correspondence and applicable decisions",
      ],
      sourceIds: ["ro-nuts", "ro-education-law"],
      signalKeys: [],
    }),
  ),
  action({
    id: "ro.early-childhood-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: antePreschool,
    action:
      "For actual ante-preschool provision, verify the creche or other early-childhood unit's provisional authorisation, accreditation and approved capacity route.",
    applicabilityExplanation:
      "The early-childhood accreditation methodology concerns ante-preschool providers; a Nursery screen alone does not establish an authorised creche.",
    unknownExplanation:
      "Confirm age range, care hours, educational claim, operator, site and authority decision.",
    expectedEvidence: [
      "Service classification, authorisation or accreditation decision and capacity record",
    ],
    sourceIds: ["ro-creche", "ro-early-accreditation"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why actual provision is outside regulated ante-preschool education or care and confirm doubtful cases with the county education authority.",
  }),
  action({
    id: "ro.preschool-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    action:
      "For actual preschool education, verify the school's authorisation, accreditation and approved preschool programme under the applicable pre-university education route.",
    applicabilityExplanation:
      "A preschool or kindergarten provision must be classified by its actual education approval; the ante-preschool creche methodology is not automatically the same route.",
    unknownExplanation:
      "Confirm ages, legal operator, educational status, site and county education authority decision.",
    expectedEvidence: [
      "Preschool authorisation or accreditation decision and approved programme",
    ],
    sourceIds: ["ro-education-law"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why no regulated preschool education is provided and verify borderline care or teaching with the county inspectorate.",
  }),
  action({
    id: "ro.child-protection-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Ensure personnel whose profession or occupation involves direct work with a child know how to report suspected abuse or neglect to the competent SPAS or DGASPC under Article 96.",
    applicabilityExplanation:
      "Article 96 concerns actual direct child-facing work and suspicion of abuse or neglect; the portal must not reveal restricted case details.",
    unknownExplanation:
      "Confirm staff roles, child ages, local SPAS/DGASPC contacts and emergency response routes.",
    expectedEvidence: [
      "Restricted safeguarding procedure, referral contacts, staff briefing and case audit trail",
    ],
    sourceIds: ["ro-child-protection"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "ro.school-violence-procedure",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Apply the covered pre-university school's violence and bullying case-management procedure, including reporting and protected records.",
    applicabilityExplanation:
      "Order 6235/2023 is specific to covered school settings; a supplementary learning centre is not a school merely because it uses school screens.",
    unknownExplanation:
      "Confirm accredited school status, responsible staff, reporting channel and current ministry procedure.",
    expectedEvidence: [
      "School case-management procedure, staff training and restricted case records",
    ],
    sourceIds: ["ro-school-violence"],
    signalKeys: ["safeguarding", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the site is outside the school procedure and verify uncertain education status with the county inspectorate.",
  }),
  action({
    id: "ro.behavioural-integrity-check",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Before employing or engaging a volunteer or similar worker in direct-contact child-facing work, request the applicable behavioural-integrity certificate or, for a foreign/stateless person, the official document specified by Article 18(2).",
    applicabilityExplanation:
      "The duty follows actual work or volunteering with direct contact; an adult or parent portal account alone is not a covered engagement. Romanian certificates are valid six months from issue under Article 16(3).",
    unknownExplanation:
      "Confirm each role's direct contact, engagement type, nationality, certificate issue date and applicable document route.",
    expectedEvidence: [
      "Role assessment, document type and verification/date record held with restricted access",
    ],
    sourceIds: ["ro-integrity"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "ro.child-facing-training",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Map safeguarding, first-aid and role-specific training for staff and volunteers and record completion and review dates.",
    applicabilityExplanation:
      "The precise qualifications and training duties depend on actual school, early-childhood and activity roles; this action does not impose a universal credential.",
    unknownExplanation:
      "Confirm staff roles, provider category, ages, activities and authority requirements.",
    expectedEvidence: [
      "Role matrix, qualifications where required, training records and review dates",
    ],
    sourceIds: [
      "ro-creche",
      "ro-school-regulation",
      "ro-school-regulation-2026",
    ],
    signalKeys: ["personnel"],
  }),
  action({
    id: "ro.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, child and health-data safeguards, privacy information, retention, rights handling, processors, access control and breach response.",
    applicabilityExplanation:
      "GDPR duties follow actual controller processing; portal evidence cannot decide lawful basis or justify broad access to sensitive records.",
    unknownExplanation:
      "Confirm controller role, purposes, special-category data, recipients, retention and cross-border transfers.",
    expectedEvidence: [
      "Processing register, notices, retention and rights procedures, processor terms and breach register",
    ],
    sourceIds: ["ro-gdpr", "ro-data-law"],
    signalKeys: ["medical", "agreements"],
  }),
  action({
    id: "ro.dpia-dpo-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess whether high-risk processing needs a DPIA and whether the operator must appoint a data-protection officer.",
    applicabilityExplanation:
      "The GDPR triggers are conditional; school or portal use alone does not settle DPIA or DPO status.",
    unknownExplanation:
      "Confirm public-body status, scale, systematic monitoring and sensitive child-data processing.",
    expectedEvidence: [
      "DPIA screening and assessment where required, with documented DPO decision",
    ],
    sourceIds: ["ro-gdpr", "ro-data-law"],
    signalKeys: ["medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the trigger assessment and check uncertain high-risk or DPO scope with the Romanian data-protection authority.",
  }),
  action({
    id: "ro.employer-risk",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: employer,
    action:
      "Assess and document occupational risks, prevention measures and worker information for actual employees and workplaces.",
    applicabilityExplanation:
      "Law 319/2006 imposes employer duties based on actual work, including relevant off-site work.",
    unknownExplanation:
      "Confirm employer status, staff roles, workplace and risks.",
    expectedEvidence: [
      "Risk assessment, prevention plan and staff briefing records",
    ],
    sourceIds: ["ro-work-safety"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "ro.fire-and-accessibility",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: premises,
    action:
      "Check the site's fire-protection and accessibility duties against its actual building use, occupancy and permit category.",
    applicabilityExplanation:
      "Fire authorisations and adaptations are conditional on premises and use; a portal sector cannot establish building approval.",
    unknownExplanation:
      "Confirm building owner/operator, use class, child capacity, disability access and competent ISU/local decisions.",
    expectedEvidence: [
      "Premises risk assessment, fire decision or documented exemption, evacuation plan and accessibility review",
    ],
    sourceIds: ["ro-fire", "ro-accessibility"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the operator has no relevant premises duty and verify uncertain fire or access requirements with the competent county ISU and local authority.",
  }),
  action({
    id: "ro.school-operation",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Apply the covered school's operating regulation to its approved education levels, admission, attendance, assessment and family information.",
    applicabilityExplanation:
      "Only actual recognised pre-university schools follow this route; non-ACE learning centres are not presumed state-funded or accredited.",
    unknownExplanation:
      "Confirm authorisation status, approved levels, programme, school year and any current regulatory amendments.",
    expectedEvidence: [
      "Approved school documents, attendance and assessment procedures, family notices",
    ],
    sourceIds: [
      "ro-education-law",
      "ro-school-regulation",
      "ro-school-regulation-2026",
    ],
    signalKeys: ["attendance", "agreements"],
  }),
  action({
    id: "ro.early-childhood-operation",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    action:
      "For covered ante-preschool or preschool provision, apply the approved curriculum, staffing, care and parent-information rules for the actual age group and service.",
    applicabilityExplanation:
      "Creche and preschool duties vary by age and authorised service; a Nursery screen does not establish the licence type.",
    unknownExplanation:
      "Confirm age bands, provider approval, capacity, staff roles and current curriculum.",
    expectedEvidence: [
      "Authorised programme, staffing plan, curriculum and parent information",
    ],
    sourceIds: ["ro-creche", "ro-early-curriculum"],
    signalKeys: ["attendance", "personnel", "agreements"],
  }),
  action({
    id: "ro.food-activity",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: food,
    action:
      "For actual food-business activity, verify the ANSVSA registration route and implement food-hygiene and HACCP-based procedures.",
    applicabilityExplanation:
      "The route depends on who prepares, handles or serves food and the operating premises; a school or club label is not an exemption.",
    unknownExplanation:
      "Confirm kitchen, caterer, operator, handling, scale, site and veterinary-food authority.",
    expectedEvidence: [
      "Food registration or documented decision, hygiene plan, temperature and inspection records",
    ],
    sourceIds: ["ro-food-hygiene", "ro-food-registration"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered food activity is operated and confirm doubtful scope with the county DSVSA.",
  }),
  action({
    id: "ro.trips",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: { field: "trips", op: "eq", value: true },
    action:
      "Plan actual trips with supervision, risk controls, emergency contacts, family information and any applicable transport permissions.",
    applicabilityExplanation:
      "Trip permissions remain separate from user agreements; transport and school-excursion rules need a further route-specific review.",
    unknownExplanation:
      "Confirm organiser, destination, ages, vehicles, staff and school status.",
    expectedEvidence: [
      "Trip assessment, supervision plan and family permission",
    ],
    sourceIds: [
      "ro-child-protection",
      "ro-school-regulation",
      "ro-school-regulation-2026",
    ],
    signalKeys: ["trips"],
  }),
  action({
    id: "ro.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "For actual ICCE provision, maintain provider registration, enrolments, approved academic projections and moderation evidence under current ICCE terms.",
    applicabilityExplanation:
      "ICCE participation is a separate provider relationship and does not grant Romanian school recognition.",
    unknownExplanation:
      "Confirm active ICCE agreement, relevant learner enrolments, projection approvals and moderation cycle.",
    expectedEvidence: [
      "ICCE registration, enrolment and projection records, moderation decisions",
    ],
    sourceIds: [
      "ro-icce-registration",
      "ro-icce-enrolment",
      "ro-icce-moderation",
    ],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no ICCE qualifications are offered; do not use the ACE screen as proof of participation.",
  }),
];
