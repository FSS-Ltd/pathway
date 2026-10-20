import type { CatalogueRequirement } from "../schema";
import {
  care,
  children,
  italyRequirement as action,
  nonStateSchool,
  outOfSchool,
  region,
  school,
} from "./shared";

export const italyInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "ita.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, birth-to-six care, recognised training and other child-facing provision with the competent Italian authorities.",
    applicabilityExplanation:
      "An ACE label, Learning Centre screen or charity sector does not establish school parity, public funding or a care licence.",
    unknownExplanation:
      "Record ages, hours, programme, legal operator, region or autonomous province, municipality and any public accreditation.",
    expectedEvidence: [
      "Provision assessment and written school-office, care-authority or training-accreditation decision",
    ],
    sourceIds: [
      "ita-school-law",
      "ita-non-parity-decree",
      "ita-early-years-act",
      "ita-training-accreditation",
    ],
    signalKeys: [],
  }),
  action({
    id: "ita.non-state-school-route",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [nonStateSchool, region] },
    action:
      "Document whether this non-state school holds parità recognition or is listed as a non-parity school by the competent regional school office.",
    applicabilityExplanation:
      "Law 62/2000 and the regional non-parity list are different routes. ACE/ICCE participation does not grant Italian school recognition.",
    unknownExplanation:
      "Confirm school level, legal operator, actual teaching and site, region, USR decision and whether the institution claims legal-value qualifications.",
    expectedEvidence: [
      "USR recognition or non-parity list entry, approved level/site and current correspondence",
    ],
    sourceIds: ["ita-school-law", "ita-non-parity-decree", "ita-regions"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "ita.state-school-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: {
      all: [
        school,
        { field: "providerCategory", op: "eq", value: "STATE_SCHOOL" },
      ],
    },
    action:
      "Review the state school's responsible administration, institutional rules, complaints route and required site or programme notifications.",
    applicabilityExplanation:
      "State schools are part of the national system, but their operating and reporting route is not the private parità application.",
    unknownExplanation:
      "Confirm the public operator, school level, registered site and current MIM or USR directions.",
    expectedEvidence: [
      "Institutional identity, rules, complaints route and authority correspondence",
    ],
    sourceIds: ["ita-school-law"],
    signalKeys: [],
  }),
  action({
    id: "ita.early-years-authorisation",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [care, region] },
    action:
      "For an actual birth-to-six educational service, retain its regional or autonomous-province and municipal operating authorisation for the site and age range.",
    applicabilityExplanation:
      "Legislative Decree 65/2017 separates educational services from scuola dell'infanzia; exact authorisation and accreditation conditions are territorial.",
    unknownExplanation:
      "Confirm whether this is a nido, micronido, integrative service, school kindergarten or another activity, and identify the competent authority.",
    expectedEvidence: [
      "Authorisation, approved places and ages, site plan, municipal or province correspondence",
    ],
    sourceIds: ["ita-early-years-act", "ita-regions"],
    signalKeys: ["medical", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site is school kindergarten or another service outside this authorisation route and confirm uncertain classification with the municipality or autonomous province.",
  }),
  action({
    id: "ita.training-accreditation",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [outOfSchool, region] },
    action:
      "Check whether vocational or publicly recognised training needs accreditation in the operating region or autonomous province.",
    applicabilityExplanation:
      "A tutoring or Learning Centre label does not automatically create a public vocational-training accreditation duty or government funding.",
    unknownExplanation:
      "Confirm programme, award, ages, funding, region and whether the service claims publicly recognised vocational status.",
    expectedEvidence: [
      "Regional scope assessment, accreditation where required or written exclusion",
    ],
    sourceIds: ["ita-training-accreditation", "ita-regions"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the teaching is outside the region's recognised-training route and confirm uncertain cases with its accreditation office.",
  }),
  action({
    id: "ita.school-bullying-route",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Maintain the school's bullying and cyberbullying prevention code, responsible contacts, reporting procedures and family information.",
    applicabilityExplanation:
      "Law 70/2024 amends school duties; a non-school club should not be presented as a statutory school under this route.",
    unknownExplanation:
      "Confirm school status, responsible staff, current MIM guidance and the applicable school regulations.",
    expectedEvidence: [
      "School code, named responsibility, reporting route, training and parent information",
    ],
    sourceIds: ["ita-bullying-law"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "ita.child-safety-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Keep a child-safety concern, urgent escalation and competent-authority referral route for the actual activity.",
    applicabilityExplanation:
      "A child-facing site needs a usable protection route, while mandatory reporting powers differ by public role and service classification.",
    unknownExplanation:
      "Confirm ages, activity, responsible people and local social-service and emergency contacts.",
    expectedEvidence: [
      "Safeguarding procedure, trained contact, restricted concern log and authority contact map",
    ],
    sourceIds: ["ita-bullying-law", "ita-early-years-act"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "ita.child-contact-check",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [children, { field: "employsStaff", op: "eq", value: true }],
    },
    action:
      "For a new contractual worker whose role entails direct and regular contact with minors, request the Article 25-bis employer certificate at hiring.",
    applicabilityExplanation:
      "Justice Ministry guidance ties the check to the role and hiring relationship, not all adult portal accounts; the certificate is not automatically re-requested every six months.",
    unknownExplanation:
      "Confirm the contract, role, direct and regular child contact and the lawful certificate request route.",
    expectedEvidence: [
      "Role assessment, lawful certificate-request outcome and hiring date; avoid storing unnecessary certificate copies",
    ],
    sourceIds: ["ita-child-contact-check"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Identify why no new contractual role has direct and regular child contact; confirm uncertain roles with the competent Justice office.",
  }),
  action({
    id: "ita.school-personnel",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review teaching qualifications, lawful employment terms and role-specific training against the school's recognised route.",
    applicabilityExplanation:
      "Parità recognition has explicit teacher and contract requirements; other school forms and support roles need their own assessment.",
    unknownExplanation:
      "Confirm state, paritaria or non-paritaria status, level, teaching roles and current USR requirements.",
    expectedEvidence: [
      "Role and qualification matrix, employment-term review and training dates",
    ],
    sourceIds: ["ita-school-law", "ita-non-parity-decree"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "ita.care-personnel",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Review educator qualifications, staffing, supervision and training against the authorised birth-to-six service.",
    applicabilityExplanation:
      "Staff rules and ratios vary with the region, autonomous province, municipality and service form.",
    unknownExplanation:
      "Confirm care type, approved places and ages, local staffing standards and role duties.",
    expectedEvidence: [
      "Authorisation conditions, staffing roster, role qualifications and training review",
    ],
    sourceIds: ["ita-early-years-act"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site does not operate an authorised early-years care service and confirm unclear scope with its municipality.",
  }),
  action({
    id: "ita.school-education",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review the school's educational plan, attendance, admissions, inclusion, assessment and family information for its legal status and level.",
    applicabilityExplanation:
      "State, paritaria and non-paritaria schools have different recognition effects; ICCE participation is separate from Italian qualifications.",
    unknownExplanation:
      "Confirm recognised level, programme, legal-value claims, pupil needs and current USR directions.",
    expectedEvidence: [
      "Educational plan, attendance and admissions records, inclusion arrangements and inspection correspondence",
    ],
    sourceIds: ["ita-school-law", "ita-non-parity-decree"],
    signalKeys: ["attendance", "personnel"],
  }),
  action({
    id: "ita.care-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Review ages, places, group size, inclusion, educational programme and parent information against the actual care authorisation.",
    applicabilityExplanation:
      "A nursery screen does not identify whether the provider runs nido, integrative care or scuola dell'infanzia.",
    unknownExplanation:
      "Confirm authorised service type, regional or province standards and municipal conditions.",
    expectedEvidence: [
      "Authorisation conditions, group and staffing records, educational programme and parent-information review",
    ],
    sourceIds: ["ita-early-years-act"],
    signalKeys: ["attendance", "personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no covered birth-to-six care service operates and verify uncertain classification with the municipality.",
  }),
];
