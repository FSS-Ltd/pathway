import type { CatalogueRequirement } from "../schema";
import {
  children,
  firstWaveAdmissions,
  formalEducation,
  interestEducation,
  lithuaniaRequirement as action,
  municipality,
  preschool,
  school,
} from "./shared";

export const lithuaniaInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "ltu.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual formal school, preschool, non-formal child or adult education, care and other activities with the competent Lithuanian authorities.",
    applicabilityExplanation:
      "Nexsteps sector, ACE identity and screen set do not establish Lithuanian school status, programme approval or public funding.",
    unknownExplanation:
      "Record ages, teaching pattern, operator, municipality, qualifications offered, childcare and any existing authority decisions.",
    expectedEvidence: [
      "Provision and legal-status assessment with written authority decisions where needed",
    ],
    sourceIds: [
      "ltu-education-law",
      "ltu-nonformal-children",
      "ltu-adult-learning",
      "ltu-preschool-admissions",
    ],
    signalKeys: [],
  }),
  action({
    id: "ltu.formal-institution-register",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Verify the formal school or preschool provider, operating site and programmes against its current education-institution register and founder records.",
    applicabilityExplanation:
      "Formal general or preschool education follows an institution route; a non-formal learning centre can have a different provider route.",
    unknownExplanation:
      "Confirm formal programme, legal operator, registered institution and site, founder decision and programme records.",
    expectedEvidence: [
      "Education-institution register entry, legal-operator record, site and programme or founder decision",
    ],
    sourceIds: ["ltu-education-law", "ltu-institution-register"],
    signalKeys: ["attendance"],
  }),
  action({
    id: "ltu.nonformal-provider-route",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: { all: [interestEducation, municipality] },
    action:
      "For an actual non-formal education programme, verify provider registration in ŠMIR and programme registration in NŠPR; assess any separate municipality accreditation or funding.",
    applicabilityExplanation:
      "The education register's current instructions require non-formal child and adult providers to register the provider and programme; municipality accreditation and financing are separate decisions.",
    unknownExplanation:
      "Confirm whether a non-formal education programme is actually offered, learner ages, provider, teacher status, register entries and municipality decisions.",
    expectedEvidence: [
      "ŠMIR provider entry, NŠPR programme entry and relevant municipality or funding decision",
    ],
    sourceIds: [
      "ltu-education-law",
      "ltu-nonformal-children",
      "ltu-adult-learning",
      "ltu-institution-register",
      "ltu-municipalities",
    ],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no non-formal education programme is offered and verify an unclear route with the municipality's education department or register administrator.",
  }),
  action({
    id: "ltu.foreign-programme-consent",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: { field: "icce", op: "eq", value: true },
    action:
      "Assess whether the actual ICCE or other foreign/international education programme needs Lithuanian ministerial consent in addition to provider approval.",
    applicabilityExplanation:
      "ICCE participation is not Lithuanian programme recognition; the Ministry has a separate consent route for covered foreign and international programmes.",
    unknownExplanation:
      "Confirm programme content, age group, certification claim, legal provider, Lithuanian status and any ministerial decision.",
    expectedEvidence: [
      "Programme classification, ministerial consent or documented reason the consent route does not apply",
    ],
    sourceIds: ["ltu-foreign-programmes", "ltu-education-law"],
    signalKeys: ["ace"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the offered ICCE activity is outside the covered foreign/international programme route and verify uncertainty with the Ministry.",
  }),
  action({
    id: "ltu.child-protection-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-safety concern, urgent escalation and referral route for the site's actual activities.",
    applicabilityExplanation:
      "Child-rights safeguards follow the service and responsible people; a club does not automatically inherit every formal-school procedure.",
    unknownExplanation:
      "Confirm ages, activities, trained contacts and local child-protection, police and social-service referral points.",
    expectedEvidence: [
      "Safeguarding procedure, restricted concern records, trained contacts and authority contact map",
    ],
    sourceIds: ["ltu-child-rights", "ltu-education-law"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "ltu.school-safety-and-inclusion",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: formalEducation,
    action:
      "Review school or preschool learner-safety, violence response, inclusion and family-information procedures against the actual registered programme.",
    applicabilityExplanation:
      "Education Law duties and the setting's health-safety norm depend on formal programme and learners' needs.",
    unknownExplanation:
      "Confirm programme, ages, support needs, responsible staff and current authority directions.",
    expectedEvidence: [
      "Internal procedures, responsible roles, family information and restricted incident process",
    ],
    sourceIds: [
      "ltu-education-law",
      "ltu-child-rights",
      "ltu-school-hygiene",
      "ltu-preschool-hygiene",
    ],
    signalKeys: ["safeguarding", "medical"],
  }),
  action({
    id: "ltu.child-work-qr-checks",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: children,
    action:
      "Identify covered workers, volunteers, trainees and service providers, verify valid child-work QR codes before covered activity and recheck at least once each calendar year.",
    applicabilityExplanation:
      "In child-serving social, cultural, education, sport and health institutions the role scope is broad; elsewhere direct and regular child contact matters. An adult portal account alone is not a work role.",
    unknownExplanation:
      "Confirm each person's duties, institution type, contact pattern and lawful QR-code verification route.",
    expectedEvidence: [
      "Role assessment, code verification status and check/recheck dates without retaining unnecessary criminal-history detail",
    ],
    sourceIds: [
      "ltu-child-rights",
      "ltu-child-work-ministry",
      "ltu-child-work-ird",
    ],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no person performs a covered role and confirm doubtful service or contact classification with the child-rights authority.",
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "Portal reminder at 365 days; Child Rights Law Article 30 requires verification at least once per calendar year for covered people. This is not a QR-code expiry date.",
  }),
  action({
    id: "ltu.teacher-qualifications",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: formalEducation,
    action:
      "Review teacher and support-specialist qualifications against each actual teaching role, programme and any verified foreign-programme exception.",
    applicabilityExplanation:
      "Order V-774 sets role-specific qualifications and has programme exceptions; a parent or other adult portal user is not a teacher.",
    unknownExplanation:
      "Confirm programme type, teaching roles, Lithuanian-language duties, qualification evidence and recognition decisions.",
    expectedEvidence: [
      "Role and qualification matrix, verified credentials and professional-development records",
    ],
    sourceIds: ["ltu-teacher-qualification", "ltu-teacher-guidance"],
    signalKeys: ["personnel"],
  }),
  action({
    id: "ltu.nonformal-teacher-review",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: { all: [interestEducation, children] },
    action:
      "Check qualifications and pedagogical preparation for people actually teaching non-formal children's programmes.",
    applicabilityExplanation:
      "Non-formal teaching has its own V-774 role route; it does not attach to every volunteer or parent account.",
    unknownExplanation:
      "Confirm teaching duties, subject, programme and recognised qualification or applicable exception.",
    expectedEvidence: [
      "Teacher-role assessment, qualification verification and training record",
    ],
    sourceIds: ["ltu-teacher-qualification", "ltu-nonformal-children"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no person teaches a covered non-formal child programme and confirm unclear roles with the Ministry or municipality.",
  }),
  action({
    id: "ltu.school-programme",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    action:
      "Review authorised curriculum, attendance, assessment, inclusion and parent information for the registered general-education programme.",
    applicabilityExplanation:
      "Formal school duties follow the actual Lithuanian programme, regardless of ACE or independent-school branding.",
    unknownExplanation:
      "Confirm education level, programme, learner ages, attendance pattern and support needs.",
    expectedEvidence: [
      "Programme and timetable, learner register/attendance, assessment and inclusion records",
    ],
    sourceIds: ["ltu-education-law", "ltu-school-hygiene"],
    signalKeys: ["attendance", "medical"],
  }),
  action({
    id: "ltu.preschool-programme",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: preschool,
    action:
      "Review the registered preschool or pre-primary programme, group size, attendance, health information and family communication.",
    applicabilityExplanation:
      "Preschool programme and HN 75 conditions differ from a general school or child activity club.",
    unknownExplanation:
      "Confirm programme, ages, group capacity, operating site and family information arrangements.",
    expectedEvidence: [
      "Preschool programme, group/attendance records, family notices and health-safety review",
    ],
    sourceIds: [
      "ltu-education-law",
      "ltu-preschool-hygiene",
      "ltu-preschool-admissions",
    ],
    signalKeys: ["attendance", "medical"],
  }),
  action({
    id: "ltu.preschool-local-admissions",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [preschool, municipality] },
    action:
      "Check the operating municipality's preschool admission rules and whether its central application system is live for this site.",
    applicabilityExplanation:
      "The central system began in 24 municipalities in March 2026; other municipalities have later planned rollout dates and local rules remain distinct.",
    unknownExplanation:
      "Confirm municipality, founder, admission year and whether the site participates in the central system.",
    expectedEvidence: [
      "Municipal admission rule or correspondence and central-system decision where applicable",
    ],
    sourceIds: ["ltu-preschool-admissions", "ltu-municipalities"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site does not offer covered preschool admissions, and check uncertain local-system status with the municipality.",
  }),
  action({
    id: "ltu.first-wave-central-admissions",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [formalEducation, firstWaveAdmissions] },
    action:
      "For 2026/27 admissions, confirm whether this school's or preschool's places and applications are handled through the central CPIS system.",
    applicabilityExplanation:
      "The Ministry named 24 first-wave municipalities; participation still depends on the institution and admission route. Other municipalities have later planned rollout.",
    unknownExplanation:
      "Confirm the municipality, school year, founder, institution participation and authority instructions.",
    expectedEvidence: [
      "Municipal or founder CPIS instruction and documented admission process",
    ],
    sourceIds: ["ltu-admissions-first-wave", "ltu-preschool-admissions"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why this institution or admission cycle is outside CPIS and confirm uncertainty with the municipality or founder.",
  }),
  action({
    id: "ltu.nonformal-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [interestEducation, children] },
    action:
      "Review the non-formal children's programme, supervision, attendance and family information for the actual provider and learner ages.",
    applicabilityExplanation:
      "A non-formal learning centre's programme is distinct from general schooling; public financing is a further conditional route.",
    unknownExplanation:
      "Confirm child ages, programme, responsible teachers, supervision, attendance and family agreements.",
    expectedEvidence: [
      "Programme description, staff roles, learner attendance and parent information",
    ],
    sourceIds: ["ltu-nonformal-children", "ltu-child-rights"],
    signalKeys: ["attendance", "personnel"],
  }),
  action({
    id: "ltu.nonformal-funding",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: {
      all: [
        interestEducation,
        {
          any: [
            { field: "fundingStatus", op: "eq", value: "PUBLIC" },
            { field: "fundingStatus", op: "eq", value: "MIXED" },
          ],
        },
        municipality,
      ],
    },
    action:
      "Verify any claimed public non-formal child-education funding against the accredited programme, learner records and municipality agreement.",
    applicabilityExplanation:
      "A non-ACE Learning Centre is not assumed government-funded; public NVŠ financing depends on approved programmes and local allocation.",
    unknownExplanation:
      "Confirm actual public funding, programme accreditation, learner register use and the municipality agreement.",
    expectedEvidence: [
      "Accreditation or funding decision, programme, learner records and municipality agreement",
    ],
    sourceIds: ["ltu-nonformal-children", "ltu-municipalities"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why no public NVŠ funding is claimed and confirm uncertain funding status with the municipality.",
  }),
];
