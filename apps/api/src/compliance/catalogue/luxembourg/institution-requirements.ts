import type { CatalogueRequirement } from "../schema";
import {
  childCare,
  children,
  commune,
  formalSchool,
  independentSchool,
  luxembourgRequirement as action,
  stateSchool,
} from "./shared";

const icce = { field: "icce", op: "eq", value: true } as const;

export const luxembourgInstitutionRequirements: CatalogueRequirement[] = [
  action({
    id: "lux.provider-classification",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Record the site's actual private or public school, SEA childcare, other education or community provision and confirm the competent approval route.",
    applicabilityExplanation:
      "An ACE or Nexsteps screen choice does not establish Luxembourg school authorisation, childcare approval or public funding.",
    unknownExplanation:
      "Confirm ages, hours, fees, programme, legal operator, school status, care capacity and any existing ministry decision.",
    expectedEvidence: [
      "Provision classification and written authority decision or correspondence",
    ],
    sourceIds: [
      "lux-private-school-law",
      "lux-sea-approval",
      "lux-fundamental-school-offer",
    ],
    signalKeys: [],
  }),
  action({
    id: "lux.private-school-authorisation",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    action:
      "Verify grand-ducal authorisation for the actual private preschool, primary or post-primary school and its approved programme and site.",
    applicabilityExplanation:
      "The private-school route follows actual school provision; ACE identity does not replace Luxembourg authorisation.",
    unknownExplanation:
      "Confirm the operator, age groups, curriculum route, authorisation instrument and approved premises.",
    expectedEvidence: [
      "Grand-ducal authorisation, programme documents and site approval",
    ],
    sourceIds: [
      "lux-private-school-law",
      "lux-education-code",
      "lux-secondary-school-offer",
    ],
    signalKeys: ["attendance", "ace"],
  }),
  action({
    id: "lux.public-school-governance",
    topic: "registration_governance",
    obligationClass: "RECOMMENDATION",
    condition: stateSchool,
    action:
      "Identify the competent public education authority, approved programme and responsible school leadership for the site.",
    applicabilityExplanation:
      "A state-school category requires an actual public institution or authority decision; it cannot be inferred from a non-ACE learning-centre label.",
    unknownExplanation:
      "Confirm founding authority, programme and responsible management.",
    expectedEvidence: [
      "Public authority or school record and approved programme",
    ],
    sourceIds: [
      "lux-education-code",
      "lux-fundamental-school-offer",
      "lux-secondary-school-offer",
    ],
    signalKeys: [],
  }),
  action({
    id: "lux.sea-approval",
    topic: "registration_governance",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "Confirm whether the actual paid child education and care service needs MENJE SEA or mini-crèche approval and keep the correct approval current.",
    applicabilityExplanation:
      "The SEA route depends on actual care, payment, children and capacity; a school or out-of-school label alone cannot decide it.",
    unknownExplanation:
      "Confirm paid provision, number and ages of children, hours, operator, site and mini-crèche classification with MENJE.",
    expectedEvidence: [
      "MENJE approval or documented authority classification and renewal record",
    ],
    sourceIds: ["lux-sea-approval", "lux-mini-creche", "lux-childcare-types"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why the actual provision is outside SEA approval and check uncertain classifications with MENJE or the commune before dismissing the action.",
  }),
  action({
    id: "lux.commune-school-interface",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: { all: [formalSchool, commune] },
    action:
      "Confirm the school's relevant commune-facing admissions and family-information process for its actual programme.",
    applicabilityExplanation:
      "Fundamental-school registration and proof obligations vary by public, private and international programme and by the family's commune.",
    unknownExplanation:
      "Confirm school programme, learner residence, admission route and commune instructions.",
    expectedEvidence: [
      "Admission policy, family information and relevant commune correspondence",
    ],
    sourceIds: ["lux-private-school-admissions", "lux-communes"],
    signalKeys: ["attendance"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no commune-facing admissions process applies and verify uncertain cases with the family's commune or MENJE.",
  }),
  action({
    id: "lux.school-programme",
    topic: "education_childcare",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Maintain the approved curriculum, assessment, attendance and parent information that matches the school's authorised programme.",
    applicabilityExplanation:
      "Official-programme, other-programme and unsubsidised private schools follow different terms; ICCE participation is not state recognition.",
    unknownExplanation:
      "Confirm programme authorisation, age range, language, attendance and assessment requirements.",
    expectedEvidence: [
      "Approved programme, timetable, attendance and assessment records",
    ],
    sourceIds: [
      "lux-private-school-law",
      "lux-fundamental-school-offer",
      "lux-secondary-school-offer",
    ],
    signalKeys: ["attendance", "ace"],
  }),
  action({
    id: "lux.sea-service-conditions",
    topic: "education_childcare",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "Where SEA approval applies, review the approved capacity, age groups, staffing ratios, quality arrangements and parent information for the site.",
    applicabilityExplanation:
      "SEA conditions are tied to the particular approval; national ratios differ by age, and mini-crèches have a separate route.",
    unknownExplanation:
      "Confirm the approval category, ages, attendance, capacity, actual staffing and authority conditions.",
    expectedEvidence: [
      "SEA approval and operating conditions, rosters and family information",
    ],
    sourceIds: ["lux-sea-approval", "lux-mini-creche"],
    signalKeys: ["attendance", "personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record the MENJE-confirmed reason SEA conditions do not apply; check uncertain care provision with MENJE or the commune.",
  }),
  action({
    id: "lux.child-protection-route",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Maintain a child-protection concern, urgent escalation and referral procedure for the site's actual work with minors.",
    applicabilityExplanation:
      "Children's safety follows the actual activity; public-school or public-service reporting procedures must not automatically be imposed on every club.",
    unknownExplanation:
      "Confirm learners' ages, responsible contacts, referral authority and emergency routes.",
    expectedEvidence: [
      "Safeguarding procedure, trained contacts and restricted concern records",
    ],
    sourceIds: ["lux-child-protection", "lux-child-protection-procedure"],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "lux.school-protection-procedure",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: formalSchool,
    action:
      "Review school-specific child-protection, incident, inclusion and family-escalation procedures against the school's actual authority route.",
    applicabilityExplanation:
      "The applicable procedure depends on whether the institution is public or private and on its programme and responsible people.",
    unknownExplanation:
      "Confirm public/private status, programme, referral duties and current ministry instructions.",
    expectedEvidence: [
      "School protection procedure, staff briefing and authority contact list",
    ],
    sourceIds: [
      "lux-child-protection",
      "lux-child-protection-procedure",
      "lux-education-code",
    ],
    signalKeys: ["safeguarding"],
  }),
  action({
    id: "lux.child-contact-checks",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: children,
    action:
      "Identify staff and volunteer roles with regular contact with minors and verify the appropriate Luxembourg criminal-record extract and review process.",
    applicabilityExplanation:
      "Bulletin 5 is role-specific; an adult or parent portal account alone does not trigger a background check.",
    unknownExplanation:
      "Confirm duties, regular child contact, residence, nationality and any sector-specific recruitment rule.",
    expectedEvidence: [
      "Role assessment, verification date, reviewer and restricted recruitment decision",
    ],
    sourceIds: ["lux-criminal-record"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Explain why no person in scope has regular contact with minors, and confirm uncertain roles with the competent authority.",
  }),
  action({
    id: "lux.sea-personnel",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: childCare,
    action:
      "For an approved SEA, verify director and staff qualifications, language profile and role-specific honourability evidence before work begins.",
    applicabilityExplanation:
      "SEA checks can cover all personnel, including support roles; extracts must be recent when presented, which is not a universal certificate expiry date.",
    unknownExplanation:
      "Confirm SEA status, roles, qualifications, home/residence countries and MENJE approval conditions.",
    expectedEvidence: [
      "Qualification and training register, verification dates, reviewer and MENJE correspondence",
    ],
    sourceIds: ["lux-sea-approval", "lux-sea-personnel", "lux-criminal-record"],
    signalKeys: ["personnel"],
    allowsNotApplicable: true,
    notApplicablePolicy:
      "Record why the site is not an SEA and verify borderline care provision with MENJE; do not dismiss a current SEA condition.",
  }),
  action({
    id: "lux.icce-provider",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Keep the actual ICCE provider registration, staff training and renewal position current where ICCE qualifications are offered.",
    applicabilityExplanation:
      "ICCE provider terms apply to participants and do not establish Luxembourg school recognition.",
    unknownExplanation:
      "Confirm qualification offer, provider registration, approved staff and renewal conditions.",
    expectedEvidence: [
      "ICCE provider confirmation, training and renewal records",
    ],
    sourceIds: ["lux-icce-registration"],
    signalKeys: ["ace", "personnel"],
  }),
  action({
    id: "lux.icce-learners",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Confirm ICCE learner enrolment, approved academic projections and moderation arrangements for offered qualifications.",
    applicabilityExplanation:
      "These provider conditions apply only when the institution actually delivers ICCE qualifications.",
    unknownExplanation:
      "Confirm enrolled qualifications, learner status, projection approvals and moderation cycle.",
    expectedEvidence: [
      "ICCE enrolment, approved projections and moderation correspondence",
    ],
    sourceIds: ["lux-icce-enrolment", "lux-icce-moderation"],
    signalKeys: ["ace"],
  }),
];
