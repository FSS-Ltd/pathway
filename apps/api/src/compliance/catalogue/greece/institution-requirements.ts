import type { CatalogueRequirement } from "../schema";
import {
  care,
  children,
  greeceRequirement as action,
  outOfSchool,
  privateSchool,
} from "./shared";

const regions: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    ..."ABCDEFGHIJKLM".split("").map((code) => ({
      field: "subdivisionCode" as const,
      op: "eq" as const,
      value: `GR-${code}`,
    })),
    { field: "subdivisionCode" as const, op: "eq" as const, value: "GR-69" },
  ],
};
const preschool = {
  field: "providerCategory",
  op: "eq",
  value: "EARLY_YEARS",
} as const;
const childcare = {
  field: "providerCategory",
  op: "eq",
  value: "CHILDCARE",
} as const;
const creativeCare: NonNullable<CatalogueRequirement["condition"]> = {
  any: [
    childcare,
    { all: [outOfSchool, { field: "childcare", op: "eq", value: true }] },
  ],
};

export const greeceInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "grc.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, tutoring, preschool-care, creative-activity and camp services with the competent Greek authorities.",
    applicabilityExplanation:
      "A Nexsteps sector, ACE affiliation or public Learning Centre screen does not prove school status, public funding or a particular operating licence.",
    unknownExplanation:
      "Record ages, hours, curriculum, supervision, legal operator, region and municipality before selecting a route.",
    expectedEvidence: [
      "Provision assessment and written education, EOPPEP, municipal or regional authority decision",
    ],
    sourceIds: [
      "grc-private-school-law",
      "grc-tutoring-notification",
      "grc-tutoring-legal-entity-notification",
      "grc-preschool-licence",
      "grc-creative-centre-licence",
    ],
    signalKeys: [],
  }),
  action({
    id: "grc.private-school-licence",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [privateSchool, regions] },
    action:
      "Retain the operating licence and approved scope for a private primary or secondary school from the competent education directorate.",
    applicabilityExplanation:
      "The private-school route is distinct from tutoring or a childcare centre; the applicant's legal form and operating region affect the procedure.",
    unknownExplanation:
      "Select the operating region and confirm school level, operator, licence, premises inspection and any special Mount Athos route with the authority.",
    expectedEvidence: [
      "Current private-school licence, approved ages/level, premises and authority correspondence",
    ],
    sourceIds: [
      "grc-private-school-licence",
      "grc-private-school-natural-person",
      "grc-private-school-law",
      "grc-regions",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "grc.tutoring-centre-notification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [outOfSchool, regions] },
    action:
      "Determine whether the actual service is a regulated tuition or foreign-language centre and retain the required operating notification or approval.",
    applicabilityExplanation:
      "EOPPEP's route depends on the service, operator and premises; ordinary informal tutoring is not classified by the Learning Centre screen alone.",
    unknownExplanation:
      "Confirm the subject, capacity, legal operator, premises and regional EOPPEP requirements before deciding the route.",
    expectedEvidence: [
      "EOPPEP notification or approval, receipt, premises file or written non-applicability decision",
    ],
    sourceIds: [
      "grc-tutoring-notification",
      "grc-tutoring-legal-entity-notification",
      "grc-regions",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why this provision is not a regulated tuition/language centre and confirm uncertain cases with EOPPEP or the education authority.",
  }),
  action({
    id: "grc.preschool-care-licence",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [preschool, regions] },
    action:
      "Retain the municipal establishment and operation licence for a qualifying preschool-care unit.",
    applicabilityExplanation:
      "Private nursery, infant and toddler care has a municipal route; school kindergarten and other child activities may use different authorities.",
    unknownExplanation:
      "Confirm the age range, unit type, operator, municipality and licence conditions.",
    expectedEvidence: [
      "Municipal licence, approved places/ages, premises and inspection records",
    ],
    sourceIds: [
      "grc-preschool-licence",
      "grc-preschool-ministry",
      "grc-regions",
    ],
    signalKeys: ["personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why this early-years service is a school kindergarten or another non-preschool-care route and confirm uncertain cases with the municipality and education authority.",
  }),
  action({
    id: "grc.creative-centre-licence",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [creativeCare, regions] },
    action:
      "Assess whether the service is a children's creative-activity centre (KDAP) and retain its regional licence if it is.",
    applicabilityExplanation:
      "After-school care can be a licensed KDAP; a school, nursery or tuition centre is not automatically one.",
    unknownExplanation:
      "Confirm ages, activities, supervision, capacity, operator and regional social-care authority classification.",
    expectedEvidence: [
      "Regional KDAP licence or documented alternative route and authority correspondence",
    ],
    sourceIds: ["grc-creative-centre-licence", "grc-regions"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the service is not a KDAP and confirm uncertain cases with the regional social-care directorate.",
  }),
  action({
    id: "grc.child-safety-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-safety concern, urgent escalation and external reporting route matched to the site's actual service.",
    applicabilityExplanation:
      "Law 4837/2021 creates specific duties for named child-protection entities; other schools and tutoring providers still need a service-appropriate route without being mislabelled as those entities.",
    unknownExplanation:
      "Confirm child-facing provision, responsible people and the competent police, prosecutor, social and education contacts.",
    expectedEvidence: [
      "Safeguarding procedure, trained contact, restricted concern log and authority contact map",
    ],
    sourceIds: ["grc-child-protection-law", "grc-child-protection-scope"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "grc.protection-officer",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "For a Law 4837/2021 child-protection entity, appoint and display the designated child-protection officer and retain the required authority notification.",
    applicabilityExplanation:
      "The named entities include preschool-care units, KDAP and children's camps; an ordinary school or tutoring centre is not brought into this scheme by a portal label.",
    unknownExplanation:
      "Confirm whether the unit is listed in article 3, the officer's role and the regional/EKKA notification route.",
    expectedEvidence: [
      "Officer appointment, contact display, authority receipt and role-specific training record",
    ],
    sourceIds: [
      "grc-child-protection-law",
      "grc-child-protection-scope",
      "grc-protection-officer",
    ],
    signalKeys: ["safeguarding", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the unit is outside the Law 4837/2021 entity list and verify uncertain status with EKKA or regional social care.",
  }),
  action({
    id: "grc.abuse-reporting",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "For a covered child-protection entity, record and promptly route abuse concerns to competent authorities and the national reporting system.",
    applicabilityExplanation:
      "Articles 4, 5 and 9 of Law 4837/2021 govern covered entities and their officer; disclosure must protect sensitive child records.",
    unknownExplanation:
      "Confirm entity status, officer, prosecutor/police/social-service route and MILA access with the competent authority.",
    expectedEvidence: [
      "Restricted incident register, notification receipts and annual reporting evidence where required",
    ],
    sourceIds: [
      "grc-child-protection-law",
      "grc-child-protection-scope",
      "grc-protection-officer",
    ],
    signalKeys: ["safeguarding"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "State the verified reason the unit is outside the listed entities; check uncertain exclusions with EKKA or regional social care.",
  }),
  action({
    id: "grc.role-restrictions",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: care,
    action:
      "For a covered child-protection entity, verify article 7 employment/volunteer restrictions and the permitted criminal-record declaration process before child-facing work.",
    applicabilityExplanation:
      "The law covers specified personnel and volunteers at listed entities, not every adult or parent portal account; avoid unnecessary certificate retention.",
    unknownExplanation:
      "Confirm entity status, each role, the lawful check route and current amendment with the competent authority.",
    expectedEvidence: [
      "Role assessment, lawful verification outcome, declaration and review date without unnecessary certificate copies",
    ],
    sourceIds: ["grc-child-protection-law", "grc-child-protection-scope"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the entity or role is outside article 7 and confirm unclear cases with regional social care.",
  }),
  action({
    id: "grc.tutor-commencement",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "For regulated tuition or language teaching, confirm each teacher's qualifications and required professional commencement declaration.",
    applicabilityExplanation:
      "The 2026 digital teacher register applies to specified tuition, language-centre and home-teaching roles, not to every adult account.",
    unknownExplanation:
      "Confirm centre type, teacher duties, qualifications and the current digital declaration route.",
    expectedEvidence: [
      "Role and qualification record, teaching-commencement receipt or documented alternative route",
    ],
    sourceIds: ["grc-teacher-commencement", "grc-tutoring-notification"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the teaching role is outside the regulated declaration route and check uncertain cases with the education authority.",
  }),
  action({
    id: "grc.school-staff",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: privateSchool,
    action:
      "Review private-school teaching appointments, qualifications and required personnel records against the approved school level.",
    applicabilityExplanation:
      "School staff oversight is part of the private-education framework; requirements differ from a tutoring-centre teacher declaration.",
    unknownExplanation:
      "Confirm school licence, level, staff roles and current education-directorate directions.",
    expectedEvidence: [
      "Qualification checks, appointment records and education-directorate correspondence",
    ],
    sourceIds: ["grc-private-school-law", "grc-private-school-licence"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "grc.school-operations",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: privateSchool,
    action:
      "Check curriculum, attendance, admissions and assessment practice against the school's approved level and education-directorate requirements.",
    applicabilityExplanation:
      "The private-school operating framework depends on the licensed school type; ICCE participation does not replace Greek school approval.",
    unknownExplanation:
      "Confirm the licence, ages, teaching level and current ministry/regional directions.",
    expectedEvidence: [
      "Approved school scope, curriculum and attendance mapping, inspection correspondence",
    ],
    sourceIds: ["grc-private-school-law", "grc-private-school-licence"],
    signalKeys: ["attendance", "personnel"],
  }),
  action({
    id: "grc.care-operations",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Review care programme, ages, capacity, staffing, inclusion and parent information against the actual preschool or KDAP licence.",
    applicabilityExplanation:
      "Municipal preschool-care and regional creative-activity centres have different operating conditions; school status alone does not select either.",
    unknownExplanation:
      "Confirm the exact unit licence, approved places/ages and authority conditions.",
    expectedEvidence: [
      "Licence conditions, staffing and capacity record, programme and parent-information review",
    ],
    sourceIds: ["grc-preschool-licence", "grc-creative-centre-licence"],
    signalKeys: ["attendance", "personnel", "medical"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no covered preschool or KDAP service operates and confirm unclear classification with the municipality or region.",
  }),
];
