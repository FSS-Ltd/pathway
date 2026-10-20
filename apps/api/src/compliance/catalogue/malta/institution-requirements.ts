import type { CatalogueRequirement } from "../schema";
import {
  childCare,
  children,
  council,
  formalSchool,
  independentSchool,
  maltaRequirement as action,
  outOfSchool,
  stateSchool,
} from "./shared";

const icce = { field: "icce", op: "eq", value: true } as const;

export const maltaInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "mt.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify the site's actual school, 0–3 childcare, non-formal, tuition, further-education or community provision and confirm its competent licensing route.",
    applicabilityExplanation:
      "ACE identity and Nexsteps sector or screen choices do not establish a Maltese school, ECEC or MFHEA licence.",
    unknownExplanation:
      "Confirm learner ages, hours, compulsory-school provision, courses, qualification claims, operator and site with DQSE or MFHEA.",
    expectedEvidence: [
      "Provision classification and written authority decision or correspondence",
    ],
    sourceIds: [
      "mt-education-act",
      "mt-school-licensing",
      "mt-mfhea-categories",
      "mt-nonformal-registration",
    ],
    signalKeys: [],
  }),
  action({
    id: "mt.private-school-licence",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Verify the DQSE licence and approved operating conditions for the actual non-state school, including its operator, site and education level.",
    applicabilityExplanation:
      "Church, independent and international school routes depend on the actual licensed school; a Church sector alone does not establish one.",
    unknownExplanation:
      "Confirm school category, licence scope, operator, premises, ages and programme with DQSE.",
    expectedEvidence: [
      "DQSE school licence and conditions, renewal or review correspondence",
    ],
    sourceIds: [
      "mt-education-act",
      "mt-school-licensing",
      "mt-school-conditions",
    ],
    signalKeys: ["attendance"],
  }),
  action({
    id: "mt.public-school-authority",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: stateSchool,
    action:
      "Record the school's actual public authority, responsible leadership and approved programme.",
    applicabilityExplanation:
      "A non-ACE Learning Centre is not automatically a state-funded school.",
    unknownExplanation:
      "Confirm the establishing public authority, leadership and programme.",
    expectedEvidence: [
      "Public authority appointment or school record and programme",
    ],
    sourceIds: ["mt-education-act", "mt-school-conditions"],
    signalKeys: [],
  }),
  action({
    id: "mt.ecec-licence",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "Assess whether the site provides licensed 0–3 early childhood education and care and, where it does, keep both planning approval and the separate DQSE licence current.",
    applicabilityExplanation:
      "A Planning Authority permit alone does not authorise an ECEC centre to operate; kindergarten and older-child services require separate classification.",
    unknownExplanation:
      "Confirm ages, care hours, operator, planning use and DQSE licence category.",
    expectedEvidence: [
      "Planning approval, DQSE licence and operating conditions or written classification",
    ],
    sourceIds: ["mt-ecec-licence", "mt-ecec-criteria"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual care is outside DQSE 0–3 licensing and check an uncertain classification with DQSE or the local authority.",
  }),
  action({
    id: "mt.out-of-school-route",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: outOfSchool,
    action:
      "Confirm whether the actual non-formal, summer-school or tuition service needs DQSE registration, a separate summer-school route or MFHEA provider licensing.",
    applicabilityExplanation:
      "Learning Centres are not automatically schools or public providers; the route depends on what is taught and whether a qualification is claimed.",
    unknownExplanation:
      "Confirm course content, age range, summer operation, fees, MQF claims and any Article 6 exception with DQSE or MFHEA.",
    expectedEvidence: [
      "DQSE or MFHEA decision, registration or licence and programme description",
    ],
    sourceIds: [
      "mt-nonformal-registration",
      "mt-summer-school",
      "mt-mfhea-categories",
      "mt-mfhea-register",
    ],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document the provision and authority-confirmed exemption; check with DQSE, MFHEA or the local authority before skipping an uncertain route.",
  }),
  action({
    id: "mt.mfhea-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record whether the site claims a Maltese or MQF-recognised qualification; if it does, check MFHEA provider licensing and programme accreditation before making that claim.",
    applicabilityExplanation:
      "Attendance-only courses and certain excluded programmes follow different routes; ICCE enrolment is not Maltese recognition.",
    unknownExplanation:
      "Confirm qualification claim, MQF level, course hours, exemption and provider category with MFHEA.",
    expectedEvidence: [
      "Qualification-claim assessment, MFHEA licence and programme decision or documented exception",
    ],
    sourceIds: [
      "mt-mfhea-act",
      "mt-mfhea-rules",
      "mt-mfhea-programme",
      "mt-mfhea-register",
    ],
    signalKeys: ["ace"],
  }),
  action({
    id: "mt.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Maintain curriculum, attendance, assessment, admissions and parent information for the school's approved programme and licence conditions.",
    applicabilityExplanation:
      "School operating conditions depend on the actual public or licensed non-state category and age groups.",
    unknownExplanation:
      "Confirm licence or authority programme, age groups and inspection conditions.",
    expectedEvidence: [
      "Approved programme, attendance register, assessments and parent information",
    ],
    sourceIds: ["mt-school-conditions", "mt-school-reviews"],
    signalKeys: ["attendance", "ace"],
  }),
  action({
    id: "mt.ecec-conditions",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For a licensed 0–3 ECEC centre, verify approved capacity, staff ratios and qualifications, child records, parent information and supervision arrangements.",
    applicabilityExplanation:
      "These requirements attach to the actual DQSE ECEC approval and age group, not every nursery screen.",
    unknownExplanation:
      "Confirm the centre's licence, child ages, attendance, staff roster and operating conditions.",
    expectedEvidence: [
      "ECEC licence conditions, staffing register, training and parent records",
    ],
    sourceIds: ["mt-ecec-licence", "mt-ecec-criteria"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why the site is not a DQSE-licensed 0–3 centre and check uncertain care with DQSE or the local authority.",
  }),
  action({
    id: "mt.safeguarding-procedure",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-protection concern, urgent escalation and referral procedure matched to the site's actual work with minors.",
    applicabilityExplanation:
      "Safeguarding follows child-facing work; school-specific policies must be applied to schools, not indiscriminately to every club.",
    unknownExplanation:
      "Confirm ages, designated contacts, incident routes and relevant DQSE or FSWS instructions.",
    expectedEvidence: [
      "Safeguarding policy, referral contacts, training and restricted concern records",
    ],
    sourceIds: ["mt-safeguarding-policy", "mt-child-referral"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "mt.child-contact-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Assess actual staff and volunteer child-contact roles and complete the applicable POMA registration or verification before covered work.",
    applicabilityExplanation:
      "POMA is role- and setting-specific; having an adult or parent portal account does not trigger a background check.",
    unknownExplanation:
      "Confirm duties, regular contact, setting and relevant authority instructions.",
    expectedEvidence: [
      "Role assessment, POMA verification details, reviewer and review date",
    ],
    sourceIds: ["mt-poma", "mt-ecec-poma"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no role is covered and check doubtful roles with DQSE, POMA authorities or the local authority.",
  }),
  action({
    id: "mt.ecec-personnel-clearance",
    topic: "personnel",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: childCare,
    action:
      "For licensed 0–3 ECEC staff, verify childcare qualifications, conduct evidence, references and yearly POMA clearance review under the DQSE standards.",
    applicabilityExplanation:
      "DQSE describes an annual centre review of POMA clearance for all ECEC employees; this is a setting-specific review, not a general certificate expiry date.",
    unknownExplanation:
      "Confirm the site's DQSE ECEC category, staff roles, qualifications, reference and clearance review records.",
    expectedEvidence: [
      "ECEC staff register, qualifications, conduct and reference checks, POMA verification and annual review date",
    ],
    sourceIds: ["mt-ecec-poma", "mt-ecec-criteria", "mt-poma"],
    signalKeys: ["personnel"],
    reviewCadenceDays: 365,
    reviewCadenceBasis:
      "DQSE ECEC FAQ says all centre employees receive yearly POMA review; confirm the site's current licence conditions.",
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the site is not a licensed 0–3 ECEC centre and confirm uncertain care with DQSE or the local authority.",
  }),
  action({
    id: "mt.teacher-warrants",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Verify teaching warrants or licences and role qualifications for staff whose school teaching roles require them.",
    applicabilityExplanation:
      "A school teacher warrant is not automatically required for every tutor, volunteer or adult user.",
    unknownExplanation:
      "Confirm actual teaching duties, grade, employment route and Council for the Teaching Profession requirements.",
    expectedEvidence: [
      "Role assessment, warrant or licence verification and qualification record",
    ],
    sourceIds: ["mt-teaching-professions", "mt-teacher-warrant"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Document why no covered teaching role exists and verify uncertainty with the Teaching Profession Council or local authority.",
  }),
  action({
    id: "mt.local-education-interface",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: council,
    action:
      "Confirm the site's local-council and regional contact for premises, activity and community notifications relevant to its actual operation.",
    applicabilityExplanation:
      "The council identifies the local authority but does not itself establish a particular school or activity permit.",
    unknownExplanation:
      "Confirm site address, council, activity and any written local requirements.",
    expectedEvidence: [
      "Site location, local authority correspondence and permit decisions where applicable",
    ],
    sourceIds: ["mt-councils", "mt-regions"],
    signalKeys: [],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no council-facing requirement applies and confirm uncertain local conditions with the site's local council.",
  }),
  action({
    id: "mt.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For actual ICCE provision, verify provider registration, responsible training and renewal conditions.",
    applicabilityExplanation:
      "ICCE provider terms apply only to participating institutions and do not substitute for Maltese authorisation.",
    unknownExplanation:
      "Confirm current ICCE participation, institution type, registration and named staff.",
    expectedEvidence: ["ICCE registration, training and renewal records"],
    sourceIds: ["mt-icce-registration"],
    signalKeys: ["ace"],
  }),
  action({
    id: "mt.icce-learners",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "For ICCE learners, review enrolment, approved academic projections and moderation arrangements.",
    applicabilityExplanation:
      "Only actual ICCE qualification provision triggers these provider conditions; portal records are evidence, not external approval.",
    unknownExplanation:
      "Confirm learner enrolment, qualification pathway, projection and moderation cycle with ICCE.",
    expectedEvidence: [
      "Enrolment confirmations, approved projections and moderation correspondence",
    ],
    sourceIds: ["mt-icce-enrolment", "mt-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
