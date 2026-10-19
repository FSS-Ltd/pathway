import type { CatalogueRequirement } from "../schema";
import { finlandRequirement as action } from "./shared";

const children = { field: "minimumAge", op: "lte", value: 17 } as const;
const school = {
  field: "providerCategory",
  op: "eq",
  value: "INDEPENDENT_SCHOOL",
} as const;
const care: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    { field: "providerCategory", op: "eq", value: "EARLY_YEARS" },
    { field: "providerCategory", op: "eq", value: "CHILDCARE" },
    { field: "childcare", op: "eq", value: true },
  ],
};
const mainland = {
  not: { field: "subdivisionCode", op: "eq", value: "FI-01" },
} as const;
const employer = { field: "employsStaff", op: "eq", value: true } as const;
const controller = {
  field: "personalDataController",
  op: "eq",
  value: true,
} as const;
const food = { field: "foodBusiness", op: "eq", value: true } as const;
const icce = { field: "icce", op: "eq", value: true } as const;

export const finlandRequirements: CatalogueRequirement[] = [
  action({
    id: "fin.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual education, early-childhood, care and out-of-school services with its municipality and competent provider authority.",
    applicabilityExplanation:
      "A school screen, ACE label or public Learning Centre type does not establish authorisation, funding or legal provider status. Åland has separate education rules.",
    unknownExplanation:
      "Record ages, hours, curriculum, care pattern, operating municipality and the authority's classification; seek written advice if uncertain.",
    expectedEvidence: [
      "Provision assessment and municipal or competent-authority correspondence",
    ],
    sourceIds: [
      "fin-basic-education-guidance",
      "fin-ecec-act",
      "fin-home-education",
      "fin-aland",
    ],
    signalKeys: [],
  }),
  action({
    id: "fin.private-basic-school",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [school, mainland] },
    action:
      "If providing private basic or pre-primary education on mainland Finland, retain the authorisation covering the actual instruction offered.",
    applicabilityExplanation:
      "Basic Education Act section 7 concerns authorised private education providers; pre-primary and preparatory instruction need a scope that covers them. Informal tutoring is a different classification.",
    unknownExplanation:
      "Confirm whether the service is formal basic/pre-primary education, its authorised scope and its region before dismissing this route.",
    expectedEvidence: [
      "Education-provider authorisation, approved scope and ministry correspondence",
    ],
    sourceIds: [
      "fin-basic-education-act",
      "fin-private-provider-guidance",
      "fin-aland",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why actual provision is not authorised basic or pre-primary education; confirm the route with the competent education authority.",
  }),
  action({
    id: "fin.private-ecec-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [care, mainland] },
    action:
      "Identify the current private daycare registration or family-daycare municipal notice route before providing early-childhood care.",
    applicabilityExplanation:
      "Current ECEC Act sections 44a and 44e separate Soteri registration for a private daycare centre from municipal notice for private family daycare. Previous permit wording is outdated for new operators; existing cases need their own transition review.",
    unknownExplanation:
      "Confirm care form, operator history, premises, municipality, registration or notice status and any transitional decision.",
    expectedEvidence: [
      "Soteri registration or municipal notice, inspection outcome and transition correspondence if applicable",
    ],
    sourceIds: ["fin-ecec-act", "fin-ecec-registration", "fin-aland"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the actual service is outside statutory ECEC, with municipality confirmation where classification is uncertain.",
  }),
  action({
    id: "fin.child-protection-reporting",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Train relevant child-facing education and care personnel to recognise and make required child-welfare and police notifications without delay.",
    applicabilityExplanation:
      "Official education guidance describes duties for personnel in relevant services and circumstances; a portal adult account alone is not such a role.",
    unknownExplanation:
      "Confirm staff roles, actual child contact, provision type and municipal reporting contacts.",
    expectedEvidence: [
      "Role-specific reporting procedure, training record and restricted referral log",
    ],
    sourceIds: ["fin-staff-reporting"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  action({
    id: "fin.child-work-extract",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess which actual child-facing staff and volunteers require a Finnish criminal-record extract and verify it through the permitted route.",
    applicabilityExplanation:
      "The Legal Register Centre's extract is role-specific, issued to the person and valid six months from issue. Six months is certificate validity, not a blanket recurring-check interval for all portal users.",
    unknownExplanation:
      "Determine actual duties, child contact, employment or volunteering terms and applicable duration before requesting an extract.",
    expectedEvidence: [
      "Role assessment, permitted sighting and verification date without retaining unnecessary criminal details",
    ],
    sourceIds: ["fin-child-work-extract"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "fin.privacy-map",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Map learner, family, staff, health and safeguarding processing and identify the controller for each purpose.",
    applicabilityExplanation:
      "GDPR and Finnish education privacy duties depend on actual processing and controller roles; agreements and guardian consents are not a substitute for lawful-basis review.",
    unknownExplanation:
      "Identify categories, purposes, recipients, processors and special-category data, including any Åland-specific education records.",
    expectedEvidence: ["Processing map and controller/processor assessment"],
    sourceIds: ["fin-gdpr", "fin-school-privacy"],
    signalKeys: [],
  }),
  action({
    id: "fin.privacy-controls",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Document lawful bases, privacy information, retention, access and security for the personal data this site controls.",
    applicabilityExplanation:
      "GDPR Articles 5, 6, 13, 14 and 32 apply to controllers; health data also need an Article 9 condition. DPIA and DPO duties are conditional, not universal.",
    unknownExplanation:
      "Confirm controller status, categories and risks, then assess special-category, breach, DPIA and DPO obligations.",
    expectedEvidence: [
      "Lawful-basis record, notices, retention schedule, access controls and conditional-duty assessment",
    ],
    sourceIds: ["fin-gdpr", "fin-school-privacy"],
    signalKeys: ["agreements", "medical"],
  }),
  action({
    id: "fin.workplace-risk",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: employer,
    action:
      "Assess work hazards and risks for staff and retain measures to eliminate or reduce them.",
    applicabilityExplanation:
      "Occupational Safety and Health Act section 10 concerns employers; site-specific fire, building, health and accessibility duties still need local review.",
    unknownExplanation:
      "Confirm employment and workplace arrangements, including shared premises and local safety authority requirements.",
    expectedEvidence: ["Workplace hazard assessment and action record"],
    sourceIds: ["fin-workplace-risk"],
    signalKeys: [],
  }),
  action({
    id: "fin.basic-education-curriculum",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [school, mainland] },
    action:
      "For authorised basic education, check the current national and local curriculum and 2026 support arrangements against the site's instruction.",
    applicabilityExplanation:
      "Current pre-primary and basic-education support changes took effect in August 2026. An out-of-school tutor is not automatically an authorised basic-education provider.",
    unknownExplanation:
      "Confirm authorisation, pupil groups, curriculum scope, municipality and support arrangements.",
    expectedEvidence: [
      "Current curriculum, support and assessment procedures and authorisation scope",
    ],
    sourceIds: [
      "fin-basic-education-guidance",
      "fin-education-support",
      "fin-aland",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "fin.ecec-child-plans",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [care, mainland] },
    action:
      "For statutory ECEC, use the current national grounds and maintain each child's individual ECEC plan with guardians.",
    applicabilityExplanation:
      "The revised grounds apply from January 2026 and later 2026 changes. The former general requirement to prepare a local ECEC plan was removed; do not treat it as a current checkbox.",
    unknownExplanation:
      "Confirm whether the service is statutory ECEC, the current grounds and the child's plan review with guardians.",
    expectedEvidence: [
      "Current ECEC practice review and individual child-plan records",
    ],
    sourceIds: ["fin-ecec-act", "fin-ecec-curriculum", "fin-aland"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "fin.food-business",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: food,
    action:
      "Classify any continuing food service and, where required, notify municipal food control before starting and maintain food-hygiene controls.",
    applicabilityExplanation:
      "The Finnish Food Authority distinguishes a continuing food business from occasional low-risk school or club events; some higher-risk activities require approval rather than notification.",
    unknownExplanation:
      "Confirm actual preparation, regularity, customers, risk and local food-control classification before deciding the route.",
    expectedEvidence: [
      "Municipal notification or approval, hygiene procedures, or documented exclusion with authority advice",
    ],
    sourceIds: ["fin-food-registration", "fin-food-hygiene"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the activity is occasional or otherwise outside the registered-food-business route, and confirm with municipal food control if uncertain.",
  }),
  action({
    id: "fin.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Maintain ICCE provider registration and renewal for qualifications actually offered.",
    applicabilityExplanation:
      "ICCE requirements apply only to participating providers; ACE branding or legal school status alone does not establish ICCE participation or Finnish qualification recognition.",
    unknownExplanation:
      "Confirm whether ICCE qualifications are offered and whether local recognition or approval is needed.",
    expectedEvidence: ["Current ICCE registration and renewal correspondence"],
    sourceIds: ["fin-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "fin.icce-enrolment",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Check ICCE student enrolment, approved academic projections and moderation for qualifications actually offered.",
    applicabilityExplanation:
      "These are provider requirements for ICCE participants, separate from Finnish education authorisation.",
    unknownExplanation:
      "Confirm participating students, level, approved projections and moderation cycle.",
    expectedEvidence: ["Enrolment, approved projection and moderation records"],
    sourceIds: ["fin-icce-enrolment", "fin-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
