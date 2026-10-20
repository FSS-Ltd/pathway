import type { CatalogueRequirement } from "../schema";
import {
  children,
  formalSchool,
  independentSchool,
  outOfSchool,
  polandRequirement as action,
  preschool,
  publicSchool,
  underThreeCare,
} from "./shared";

const icce = { field: "icce", op: "eq", value: true } as const;

export const polandInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "pl.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the actual public, non-public, preschool, under-three care, tuition or community-service route and its legal operator before relying on a portal sector.",
    applicabilityExplanation:
      "A Church, ACE or Learning Centre screen does not prove Polish school status, public permission or municipal childcare registration.",
    unknownExplanation:
      "Confirm ages, school claims, care pattern, legal operator, funding and authority decisions.",
    expectedEvidence: [
      "Provider classification and competent-authority correspondence",
    ],
    sourceIds: ["pl-education-law", "pl-under3-law", "pl-nonpublic-register"],
    signalKeys: [],
  }),
  action({
    id: "pl.nonpublic-school-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "For an actual non-public school or covered educational institution, verify its entry in the competent local-government register and maintain required changes and school documents.",
    applicabilityExplanation:
      "Non-public school registration is a legal classification, not an inference from private funding or ACE materials; the competent gmina or powiat depends on type.",
    unknownExplanation:
      "Confirm school type, operator, premises, education-superintendent requirements and competent register.",
    expectedEvidence: [
      "Register certificate, statute, education programme and change notices",
    ],
    sourceIds: ["pl-education-law", "pl-nonpublic-register"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the authority-confirmed route outside the non-public-school register and check doubtful education claims with the gmina, powiat or kurator oświaty.",
  }),
  action({
    id: "pl.public-school-permission",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: publicSchool,
    action:
      "If a non-local-government operator establishes a public school, verify the required local-government authorization and education-superintendent opinion.",
    applicabilityExplanation:
      "A public school may be operated by a non-government body; a non-ACE Learning Centre is not automatically a public school.",
    unknownExplanation:
      "Confirm school status, operator, prior permission, transfer arrangement and competent education authority.",
    expectedEvidence: [
      "Authorization or lawful transfer record, superintendent opinion and school statute",
    ],
    sourceIds: ["pl-education-law", "pl-public-authorization"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain the public operator's actual authorization route or local-government status, and verify uncertainty with the competent gmina or powiat.",
  }),
  action({
    id: "pl.preschool-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: preschool,
    action:
      "Classify the actual preschool or other preschool form and verify its municipal register entry or public authorization before operation.",
    applicabilityExplanation:
      "Preschool provision and under-three nursery care follow different rules, even when both appear under an early-years screen.",
    unknownExplanation:
      "Confirm child ages, service form, operator, school status, location and municipal decision.",
    expectedEvidence: [
      "Municipal registration or permission, statute or programme and site documents",
    ],
    sourceIds: ["pl-preschool", "pl-education-law"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe why the provision is outside regulated preschool forms and confirm doubtful cases with the gmina or kurator oświaty.",
  }),
  action({
    id: "pl.under3-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: underThreeCare,
    action:
      "For a żłobek, klub dziecięcy or covered day-carer service, verify the correct municipal register or list entry before providing under-three care.",
    applicabilityExplanation:
      "The municipality's under-three care register is separate from school and preschool registration.",
    unknownExplanation:
      "Confirm ages, service type, operator, address, RKZ process and local registration decision.",
    expectedEvidence: [
      "Municipal register/list entry, RKZ filing and location records",
    ],
    sourceIds: [
      "pl-under3-law",
      "pl-under3-registration",
      "pl-under3-transition",
    ],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the actual care is outside the under-three register and check the classification with the gmina before dismissing it.",
  }),
  action({
    id: "pl.under3-standards",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: underThreeCare,
    action:
      "Meet the mandatory 2026 under-three care standards and record the correct RKZ declaration or new-provider registration path.",
    applicabilityExplanation:
      "The regulation distinguishes mandatory standards from optional quality enhancements and existing from newly registered providers.",
    unknownExplanation:
      "Confirm service opening date, RKZ-8 or RKZ-1 route, care plan, staff practice and municipal review.",
    expectedEvidence: [
      "Care-standard assessment, care plan, RKZ filing and staff/parent records",
    ],
    sourceIds: ["pl-under3-standards", "pl-under3-transition"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the service is not regulated under-three care and verify uncertain status with the gmina.",
  }),
  action({
    id: "pl.tuition-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Assess whether supplementary tuition, clubs, camps or ACE teaching crosses into a registered school, preschool, childcare or holiday-organisation route.",
    applicabilityExplanation:
      "Out-of-school tuition does not itself fulfil Polish compulsory schooling or establish education-system recognition.",
    unknownExplanation:
      "Confirm ages, hours, educational claims, care, qualifications, holiday activities and local authority advice.",
    expectedEvidence: [
      "Programme description and registration-classification decision",
    ],
    sourceIds: ["pl-education-law", "pl-nonpublic-register", "pl-holiday-2026"],
    signalKeys: ["attendance", "ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Describe the actual provision and check any school, care or holiday claim with the gmina, powiat or kurator oświaty.",
  }),
  action({
    id: "pl.local-authority-interface",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the site's gmina, powiat and voivodeship and confirm the school, care, building or activity decisions required at that address.",
    applicabilityExplanation:
      "TERC codes locate the site but do not prove a permit. Different duties may sit with the gmina, powiat, sanitary inspector or education superintendent.",
    unknownExplanation:
      "Confirm the operating address, exact TERC municipality, county and authority correspondence.",
    expectedEvidence: [
      "Location record and applicable authority decisions or documented no-permit assessment",
    ],
    sourceIds: ["pl-terc", "pl-nonpublic-register", "pl-under3-registration"],
    signalKeys: [],
  }),
  action({
    id: "pl.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Maintain the curriculum, attendance, assessment, admission, additional-needs and parent information appropriate to the school's actual public or non-public route.",
    applicabilityExplanation:
      "School records and educational obligations differ by type; ICCE records do not replace Polish education-system recognition.",
    unknownExplanation:
      "Confirm school type, learner ages, compulsory-education status and the applicable superintendent framework.",
    expectedEvidence: [
      "School statute, curriculum, attendance and assessment records",
    ],
    sourceIds: ["pl-education-law", "pl-school-records"],
    signalKeys: ["attendance", "ace"],
  }),
  action({
    id: "pl.preschool-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: preschool,
    action:
      "Keep the preschool programme, child attendance and family information appropriate to its registered form and ages.",
    applicabilityExplanation:
      "A preschool or preschool point is an education route distinct from a żłobek or children's club.",
    unknownExplanation:
      "Confirm registered form, ages, staffing, additional needs and current education requirements.",
    expectedEvidence: [
      "Programme, register entry, attendance and parent communications",
    ],
    sourceIds: ["pl-preschool", "pl-school-records"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "pl.child-protection-standards",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Adopt and publish child-protection standards suited to the site's actual school, care, religious, sport, recreational or interest-development activities.",
    applicabilityExplanation:
      "Article 22b covers many child-facing organisations beyond schools; the scope follows activities, not the selected portal sector.",
    unknownExplanation:
      "Confirm whether minors may attend, actual activities, reporting roles, safe-contact rules and review process.",
    expectedEvidence: [
      "Full and child-accessible standards, reporting procedure, staff briefing and review record",
    ],
    sourceIds: [
      "pl-child-protection-law",
      "pl-child-protection-scope",
      "pl-child-protection-guides",
    ],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "pl.child-protection-response",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a confidential route for concerns, emergency action, external referral and safe records under the site's child-protection standards.",
    applicabilityExplanation:
      "The response procedure must fit the actual setting and competent services; tracker evidence must not expose case details.",
    unknownExplanation:
      "Confirm leadership, reporting contacts, local services and staff training.",
    expectedEvidence: [
      "Restricted procedure, referral contacts and training record",
    ],
    sourceIds: ["pl-child-protection-law", "pl-child-protection-guides"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "pl.pre-engagement-checks",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Before admitting a person to child-facing education, care, sport, religious or similar work, assess and complete the article 21 register and criminal-record checks required for that role.",
    applicabilityExplanation:
      "A parent or adult account alone is not a child-contact role; actual staff, volunteers and participating parents may enter scope when assigned covered work.",
    unknownExplanation:
      "Confirm duties, access to minors, employer/organiser role, prior countries of residence and statutory exceptions.",
    expectedEvidence: [
      "Restricted role decision, register and certificate verification, date and reviewer",
    ],
    sourceIds: ["pl-child-protection-law", "pl-child-protection-roles"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why a person has no covered child-facing activity and verify borderline roles with the organiser or competent authority.",
  }),
  action({
    id: "pl.teacher-eligibility",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Map teacher roles to the correct qualification, employment and CROD disciplinary-check route.",
    applicabilityExplanation:
      "CROD is a school-director route for covered teaching positions, not a general check on all portal adults.",
    unknownExplanation:
      "Confirm school type, teaching role, PESEL or alternative inquiry and current qualification rules.",
    expectedEvidence: [
      "Role matrix, qualification record and restricted CROD verification",
    ],
    sourceIds: ["pl-teacher-register", "pl-education-law"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered teaching role exists and confirm uncertainty with the director or kurator oświaty.",
  }),
  action({
    id: "pl.under3-personnel",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: underThreeCare,
    action:
      "Verify under-three carers' qualifications, role-specific screening, first-aid training and child-to-carer ratios for the registered service.",
    applicabilityExplanation:
      "Ratios and qualifications vary with service, child age and additional needs; account type is not a staff-role proxy.",
    unknownExplanation:
      "Confirm the register category, children and needs, staffing and current municipal interpretation.",
    expectedEvidence: [
      "Qualification and screening records, first-aid training, rosters and ratio calculations",
    ],
    sourceIds: [
      "pl-under3-law",
      "pl-under3-registration",
      "pl-child-protection-law",
    ],
    signalKeys: ["personnel", "attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the site has no regulated under-three roles and check uncertain staffing with the gmina.",
  }),
  action({
    id: "pl.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For actual ICCE participation, verify provider registration, responsible staff training and renewal terms.",
    applicabilityExplanation:
      "ICCE terms apply only to participating providers and do not establish Polish school status or qualification recognition.",
    unknownExplanation:
      "Confirm ICCE participation, registration, staff roles and renewal date.",
    expectedEvidence: ["ICCE registration, training and renewal records"],
    sourceIds: ["pl-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "pl.icce-learners",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For ICCE learners, verify enrolment, approved academic projections and moderation arrangements.",
    applicabilityExplanation:
      "Portal evidence supports provider checks without implying external approval or Polish recognition.",
    unknownExplanation:
      "Confirm qualification path, learner enrolment, projection approval and moderation cycle with ICCE.",
    expectedEvidence: [
      "Enrolment confirmations, approved projections and moderation correspondence",
    ],
    sourceIds: ["pl-icce-enrolment", "pl-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
