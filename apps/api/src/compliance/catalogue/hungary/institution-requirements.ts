import type { CatalogueRequirement } from "../schema";
import {
  care,
  children,
  hungaryRequirement as action,
  nonStateSchool,
  outOfSchool,
  school,
} from "./shared";

const countyCodes = [
  "BA",
  "BK",
  "BE",
  "BZ",
  "BU",
  "CS",
  "FE",
  "GS",
  "HB",
  "HE",
  "JN",
  "KE",
  "NO",
  "PE",
  "SO",
  "SZ",
  "TO",
  "VA",
  "VE",
  "ZA",
];
const county: NonNullable<CatalogueRequirement["condition"]> = {
  any: countyCodes.map((code) => ({
    field: "subdivisionCode" as const,
    op: "eq" as const,
    value: `HU-${code}`,
  })),
};

export const hungaryInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "hun.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, kindergarten, childcare, organised training and other services with the competent Hungarian authorities.",
    applicabilityExplanation:
      "A Nexsteps sector, ACE affiliation or Public Learning Centre screen does not establish public funding, public-education status or an adult-training permission route.",
    unknownExplanation:
      "Record ages, teaching purpose, hours, supervision, legal operator, county, municipality and funding before selecting a route.",
    expectedEvidence: [
      "Provision assessment and written education, child-welfare or training-authority classification",
    ],
    sourceIds: [
      "hun-education-act",
      "hun-child-welfare-act",
      "hun-adult-training-act",
    ],
    signalKeys: [],
  }),
  action({
    id: "hun.non-state-school-permit",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [nonStateSchool, county] },
    action:
      "Retain the registration and operating permission for a non-state Hungarian public-education institution and its actual site.",
    applicabilityExplanation:
      "Church and private maintainers use a public-education operating route; ACE curriculum or an ICCE award does not replace Hungarian recognition.",
    unknownExplanation:
      "Confirm provider status, school level, maintainer, county/Budapest government office, site and current permit conditions.",
    expectedEvidence: [
      "Registration decision, current operating permit, approved site and level, maintainer and authority correspondence",
    ],
    sourceIds: ["hun-education-act", "hun-education-decree", "hun-counties"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "hun.school-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [school, county] },
    action:
      "Review the school's legal maintainer, institutional rules, complaints route and required changes or notifications for the registered site.",
    applicabilityExplanation:
      "A state school and a non-state school can share public-education duties while having different maintainers and permission procedures.",
    unknownExplanation:
      "Confirm the maintainer, registered site, school form and current government-office directions.",
    expectedEvidence: [
      "Founding/maintainer record, institutional rules, complaints procedure and change-notification receipts",
    ],
    sourceIds: ["hun-education-act", "hun-education-decree"],
    signalKeys: [],
  }),
  action({
    id: "hun.training-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Determine whether organised learning is within Hungary's adult-training law and retain the declaration or conditional permit if required.",
    applicabilityExplanation:
      "The law covers specified organised competence training and has exclusions; a Learning Centre or tuition label alone cannot settle its scope.",
    unknownExplanation:
      "Confirm purpose, participants, fee, records, public funding and the currently competent authority.",
    expectedEvidence: [
      "Scope assessment, current declaration/permit or written exclusion and authority correspondence",
    ],
    sourceIds: ["hun-adult-training-act"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain the statutory exclusion or why this is not covered organised training; confirm uncertain cases with the current training authority.",
  }),
  action({
    id: "hun.childcare-registry",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [care, county] },
    action:
      "For a child-welfare day-care provider, retain its authorised service-register entry and approved capacity/site.",
    applicabilityExplanation:
      "Crèche and day-care services have child-welfare routes; school kindergarten and informal child activities may have different legal classifications.",
    unknownExplanation:
      "Confirm service type, operator, ages, county/Budapest authority, site, registered places and any local conditions.",
    expectedEvidence: [
      "Service-register entry, approved places/ages, site and inspection correspondence",
    ],
    sourceIds: ["hun-child-welfare-act", "hun-care-decree", "hun-counties"],
    signalKeys: ["personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the actual service is school kindergarten or another route, and check uncertain classification with the county child-welfare authority.",
  }),
  action({
    id: "hun.child-safety-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-safety concern, urgent escalation and external reporting route for the actual service.",
    applicabilityExplanation:
      "Hungarian child-welfare signalling duties depend on an institution's legal role; every child-facing site should know how to reach the competent child-welfare and emergency authorities.",
    unknownExplanation:
      "Confirm child-facing activities, responsible staff and the competent local child-welfare service, guardianship authority and police contacts.",
    expectedEvidence: [
      "Safeguarding procedure, trained contact, restricted concern log and authority contact map",
    ],
    sourceIds: ["hun-child-welfare-act", "hun-education-act"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "hun.child-welfare-signal",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: { any: [school, care] },
    action:
      "For a covered school or child-welfare provider, document timely child-endangerment signals and authority escalation under Act XXXI section 17.",
    applicabilityExplanation:
      "The signalling network lists education and child-welfare services; a parent account or unclassified club is not made a statutory reporting institution by its portal role.",
    unknownExplanation:
      "Confirm institution status, reportable concern, local child-welfare service and serious-harm authority route.",
    expectedEvidence: [
      "Restricted concern and referral record, contact procedure and staff instruction",
    ],
    sourceIds: ["hun-child-welfare-act", "hun-education-act"],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why this provider is outside the statutory signalling network and verify uncertain cases with the child-welfare authority.",
  }),
  action({
    id: "hun.school-personnel",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review teacher and child-supervision appointments, qualifications, suitability and role-specific training against the approved school type.",
    applicabilityExplanation:
      "Public-education staff rules follow the actual institution and role; do not demand criminal-record evidence from every adult or parent portal account.",
    unknownExplanation:
      "Confirm school form, teaching/support duties and current education-authority guidance before choosing checks.",
    expectedEvidence: [
      "Role matrix, qualifications, lawful suitability outcomes and training review dates",
    ],
    sourceIds: ["hun-education-act", "hun-education-decree"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "hun.care-personnel",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "For a covered child-welfare service, verify role qualifications, staffing minimums and lawful child-facing restrictions.",
    applicabilityExplanation:
      "Decree 15/1998 and Act XXXI attach requirements to the service and role, not to all portal users; avoid retaining unnecessary certificate copies.",
    unknownExplanation:
      "Confirm registered care type, group ages, roles, required qualifications and current authority checks.",
    expectedEvidence: [
      "Staffing/qualification matrix, lawful verification outcomes and review dates",
    ],
    sourceIds: ["hun-care-decree", "hun-child-welfare-act"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why no covered child-welfare care service or role exists and confirm uncertain scope with the county authority.",
  }),
  action({
    id: "hun.school-education",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: school,
    action:
      "Review curriculum, attendance, admissions, assessment, inclusion and parent information for the registered school level.",
    applicabilityExplanation:
      "Hungarian public-education duties depend on the school's authorised type and age range; ICCE participation is a separate provider relationship.",
    unknownExplanation:
      "Confirm level, programme, compulsory-schooling route, pupil needs and current education-authority directions.",
    expectedEvidence: [
      "Approved programme, attendance and admissions records, inclusion plan and inspection correspondence",
    ],
    sourceIds: ["hun-education-act", "hun-education-decree"],
    signalKeys: ["attendance", "personnel"],
  }),
  action({
    id: "hun.care-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Review age limits, group size, staffing, care programme, inclusion and parent information against the actual care registration.",
    applicabilityExplanation:
      "Crèche and other child-welfare care forms have different conditions; a nursery screen does not identify the legal service by itself.",
    unknownExplanation:
      "Confirm authorised care type, registered places, ages and county/local conditions.",
    expectedEvidence: [
      "Service-register conditions, group and staffing record, programme and parent-information review",
    ],
    sourceIds: ["hun-child-welfare-act", "hun-care-decree"],
    signalKeys: ["attendance", "personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered child-welfare care service operates and confirm unclear classification with the county authority.",
  }),
];
