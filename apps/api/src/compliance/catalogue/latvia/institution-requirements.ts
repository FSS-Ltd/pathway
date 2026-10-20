import type { CatalogueRequirement } from "../schema";
import {
  care,
  children,
  formalEducation,
  latviaRequirement as action,
  municipality,
} from "./shared";
const interestEducation = {
  field: "providerCategory",
  op: "eq",
  value: "OUT_OF_SCHOOL",
} as const;

export const latviaInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "lva.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify this site's actual formal education, interest education, child supervision, camp and other activities with the competent Latvian authorities.",
    applicabilityExplanation:
      "The chosen Nexsteps sector, ACE label or Learning Centre screen does not determine Latvian registration, school status or public funding.",
    unknownExplanation:
      "Record ages, teaching or supervision pattern, operator, operating municipality, qualifications offered and relevant public decisions.",
    expectedEvidence: [
      "Provision and legal-status assessment with written authority decisions where needed",
    ],
    sourceIds: [
      "lva-education-law",
      "lva-institution-register",
      "lva-programme-guidance",
      "lva-child-supervision",
    ],
    signalKeys: [],
  }),
  action({
    id: "lva.education-registration",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Confirm the formal school or preschool institution and its operating site are registered in the Education Institution Register before implementing the programme.",
    applicabilityExplanation:
      "Formal school and preschool provision uses an institution route; an interest-education club may have a different municipal route.",
    unknownExplanation:
      "Confirm formal programme type, legal operator, site, register entry and any programme-specific permission.",
    expectedEvidence: [
      "Current register entry, registered address and programme or licensing decision",
    ],
    sourceIds: [
      "lva-education-law",
      "lva-institution-register",
      "lva-general-education",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "lva.interest-education-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { all: [interestEducation, municipality] },
    action:
      "Check whether the actual interest-education or adult non-formal programme needs a licence or permission from the operating municipality.",
    applicabilityExplanation:
      "A provider outside the institution register may use a municipal route; a registered institution can have different permissions.",
    unknownExplanation:
      "Confirm programme, ages, legal operator, teacher status, registered-institution status and local binding rules.",
    expectedEvidence: [
      "Municipal licence or written route assessment, programme description and responsible teacher details",
    ],
    sourceIds: ["lva-education-law", "lva-programme-guidance", "lva-atvk"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the activity is not municipal interest/adult non-formal education, and confirm uncertain cases with the operating municipality.",
  }),
  action({
    id: "lva.child-supervision-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      all: [
        {
          any: [
            { field: "providerCategory", op: "eq", value: "CHILDCARE" },
            {
              all: [
                { field: "childcare", op: "eq", value: true },
                {
                  not: {
                    field: "providerCategory",
                    op: "eq",
                    value: "EARLY_YEARS",
                  },
                },
              ],
            },
          ],
        },
        municipality,
      ],
    },
    action:
      "If providing a child-supervision service, retain its Education Quality State Service provider-register entry and approved service details.",
    applicabilityExplanation:
      "Regulation 404 and Child Protection Law section 50³ establish a child-supervision route distinct from formal preschool education.",
    unknownExplanation:
      "Confirm service type, children's ages, hours, site, registered provider and any preschool-institution status.",
    expectedEvidence: [
      "Child-supervision register entry, service description, site and authority correspondence",
    ],
    sourceIds: ["lva-child-supervision", "lva-child-protection", "lva-atvk"],
    signalKeys: ["medical", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the site is not a child-supervision provider, including any formal preschool route, and verify uncertainty with the Education Quality State Service.",
  }),
  action({
    id: "lva.programme-licensing",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: formalEducation,
    action:
      "Review the current programme-licensing and institution-accreditation decisions for the formal education actually offered.",
    applicabilityExplanation:
      "The 2026 licensing change and 2027 accreditation change have different commencement dates; neither is inferred from an ACE qualification.",
    unknownExplanation:
      "Confirm programme level, licence date, accreditation status, founder and current Education Quality State Service directions.",
    expectedEvidence: [
      "Programme record, current licensing or founder decision and applicable accreditation review",
    ],
    sourceIds: [
      "lva-education-law",
      "lva-programme-guidance",
      "lva-licensing-change",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "lva.school-safety-procedure",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Maintain institution safety and internal-order rules, named responsibilities, parent information and the required violence-reporting route.",
    applicabilityExplanation:
      "The education-institution safety regulation applies to covered school and preschool settings and their organised events.",
    unknownExplanation:
      "Confirm institutional status, age groups, responsible personnel and current reporting authority.",
    expectedEvidence: [
      "Internal-order and safety rules, parent communication, staff roles and restricted incident procedure",
    ],
    sourceIds: ["lva-school-safety", "lva-child-protection"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "lva.child-protection-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-safety concern, urgent escalation and referral route for the site's actual activities.",
    applicabilityExplanation:
      "Child-protection and reporting arrangements follow the role and service; non-school activities do not automatically inherit the school's exact procedure.",
    unknownExplanation:
      "Confirm ages, activities, responsible people and local child-protection, police and social-service contacts.",
    expectedEvidence: [
      "Safeguarding procedure, trained contacts, restricted concern log and authority contact map",
    ],
    sourceIds: ["lva-child-protection", "lva-school-safety"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "lva.child-role-checks",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Identify people fulfilling duties in covered child settings, request the legally required Punishment Register information and re-verify it at least annually.",
    applicabilityExplanation:
      "Child Protection Law section 72 covers relevant staff, volunteers, event organisers and contractual service roles; it does not make every adult portal account a checked worker.",
    unknownExplanation:
      "Confirm each person's duties, service relationship, child contact and lawful register-check route.",
    expectedEvidence: [
      "Role assessment, check outcome and check/recheck dates without retaining unnecessary criminal-history detail",
    ],
    sourceIds: ["lva-child-protection"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no person fulfils duties in a covered child setting and confirm doubtful roles with the competent child-protection authority.",
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Child Protection Law section 72 requires the responsible person to re-verify qualifying people at least annually; dates belong to checks, not a certificate expiry.",
  }),
  action({
    id: "lva.teacher-qualifications",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Check educator qualifications and professional-competence development against each actual teaching role and programme.",
    applicabilityExplanation:
      "Regulation 569 and the Education Law define teacher-role requirements; a parent or other adult account is not a teacher role.",
    unknownExplanation:
      "Confirm programme level, teaching role, qualification evidence and current training requirements.",
    expectedEvidence: [
      "Role and qualification matrix, verification dates and professional-development record",
    ],
    sourceIds: ["lva-teacher-qualification", "lva-education-law"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "lva.supervision-personnel",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Review child-supervision staffing, competence, first-aid and role-specific training for the authorised service.",
    applicabilityExplanation:
      "Regulation 404 has service-specific requirements; formal preschool educators also need their own teaching qualifications.",
    unknownExplanation:
      "Confirm whether this is formal preschool or child supervision, ages, group size and staff duties.",
    expectedEvidence: [
      "Service conditions, role roster, qualification and training records",
    ],
    sourceIds: [
      "lva-child-supervision",
      "lva-teacher-qualification",
      "lva-child-protection",
    ],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no child-supervision service operates and verify an unclear classification with the Education Quality State Service.",
  }),
  action({
    id: "lva.school-programme",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Review programme content, attendance, assessment, inclusion and parent information against the registered school or preschool programme.",
    applicabilityExplanation:
      "Latvian general education and preschool programme duties follow actual formal provision, regardless of ACE participation.",
    unknownExplanation:
      "Confirm registered level, authorised programme, age range, attendance arrangement and learner support needs.",
    expectedEvidence: [
      "Current programme, learner records, attendance, assessment and inclusion arrangements",
    ],
    sourceIds: ["lva-general-education", "lva-education-law"],
    signalKeys: ["attendance", "medical"],
  }),
  action({
    id: "lva.childcare-service-review",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: care,
    action:
      "Review ages, supervision hours, group size, family information and care arrangements against the service's actual route.",
    applicabilityExplanation:
      "Formal preschool and registered child supervision have different legal conditions; a nursery screen is not a licence.",
    unknownExplanation:
      "Confirm service type, ages, registered capacity, operating site and authority conditions.",
    expectedEvidence: [
      "Registration or programme conditions, attendance/group records and parent-information review",
    ],
    sourceIds: [
      "lva-child-supervision",
      "lva-general-education",
      "lva-preschool-hygiene",
    ],
    signalKeys: ["attendance", "medical", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why neither preschool nor child supervision operates, and check uncertain cases with the competent service authority.",
  }),
];
