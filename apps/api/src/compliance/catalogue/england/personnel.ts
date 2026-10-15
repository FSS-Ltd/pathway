import { englandRequirement, englandSource } from "./shared";
import { school, earlyYears } from "./conditions";

const currentUnknown = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Current official guidance independently checked; no single commencement date established for the underlying amended duties.",
};
export const personnelSources = [
  englandSource({
    id: "eng-dbs-role-eligibility",
    url: "https://www.gov.uk/government/publications/dbs-guidance-leaflets/regulated-activity-with-children",
    title: "Regulated activity with children",
    authority: "Disclosure and Barring Service",
    provision:
      "Sections 3–4: activities, frequency, supervision and specified establishments; updated 17 September 2026",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current update verified; original publication day not independently established.",
    effective: currentUnknown,
  }),
  englandSource({
    id: "eng-dbs-employer-guidance",
    url: "https://www.gov.uk/guidance/dbs-check-requests-guidance-for-employers",
    title:
      "DBS checks guidance for employers, voluntary organisations and third parties",
    authority: "Disclosure and Barring Service",
    provision:
      "Eligibility; Duration of criminal record check validity; Accepting a previously-issued DBS check",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original publication day not independently established; current text verified.",
    effective: currentUnknown,
  }),
  englandSource({
    id: "eng-svga-referral",
    url: "https://www.legislation.gov.uk/ukpga/2006/47/section/35",
    title: "Safeguarding Vulnerable Groups Act 2006, section 35",
    authority: "UK Parliament",
    provision:
      "Subsections 1–5 and 7: regulated-activity provider information/referral conditions, including withdrawal or departure and conduct/harm conditions",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original publication day not independently established.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Subsections 2–7 commenced 12 October 2009 (SI2009/2611); current text includes later amendments with distinct commencements.",
    },
  }),
  englandSource({
    id: "eng-dbs-referral-guide",
    url: "https://www.gov.uk/government/publications/dbs-referral-and-barring-decision-making-process/dbs-referrals-guide-referral-and-decision-making-process",
    title: "DBS referrals guide: referral and decision-making process",
    authority: "Disclosure and Barring Service",
    provision:
      "Duty to refer: regulated activity providers and personnel suppliers; removal and relevant conduct or harm-test conditions",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original publication day not independently established; current text verified.",
    effective: currentUnknown,
  }),
];
export const personnelRequirements = [
  englandRequirement({
    id: "eng-out-of-school-personnel",
    action:
      "Check identity, references and role skills; maintain safeguarding training and first-aid needs and coverage assessments for out-of-school provision.",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: {
      all: [
        { field: "providerCategory", op: "eq", value: "OUT_OF_SCHOOL" },
        { field: "minimumAge", op: "lte", value: 17 },
      ],
    },
    applicabilityExplanation:
      "DfE out-of-school recommendations support safe recruitment and suitable training. Check its exclusions for schools, registered alternative provision and registered childcare. First-aid and DBS requirements depend on assessed activities, not account type.",
    unknownExplanation: "Confirm actual out-of-school status and ages served.",
    expectedEvidence: [
      "Recruitment and refresher register, references, first-aid assessment and coverage",
    ],
    sourceIds: ["eng-oos-safeguarding", "eng-dbs-role-eligibility"],
    signalKeys: ["personnel"],
  }),

  englandRequirement({
    id: "eng-school-recruitment",
    action:
      "Verify role-appropriate identity, references, work entitlement, qualifications, prohibition and eligible criminal-record checks before appointment; assess overseas history and supply-staff assurances.",
    topic: "personnel",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    applicabilityExplanation:
      "KCSIE Part 3 sets school recruitment expectations and identifies mandatory checks. Eligibility, timing and prohibition rules depend on the actual role, not an adult or parent portal account.",
    unknownExplanation:
      "Confirm actual school classification and assess each appointment's duties.",
    expectedEvidence: [
      "Role assessment, verified recruitment checklist, verifier and dates",
    ],
    sourceIds: ["eng-kcsie-2026"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng-school-central-record",
    action:
      "Maintain the single central record of required pre-appointment checks, including applicable supply staff and proprietor-body entries.",
    topic: "personnel",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    applicabilityExplanation:
      "KCSIE 347–357 describes the mandatory register and school-type/role differences. A portal training list alone is not proof that the statutory record is complete.",
    unknownExplanation:
      "Confirm school classification and the roles covered by its register.",
    expectedEvidence: [
      "Controlled single central record, check dates and verification audit",
    ],
    sourceIds: ["eng-kcsie-2026"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng-school-safeguarding-training",
    action:
      "Provide safeguarding induction and at least annual updates; renew DSL training at least every two years and record staff reading of KCSIE Part 1.",
    topic: "personnel",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    applicabilityExplanation:
      "KCSIE 153–154 and Annex B set training expectations. Its publication page expects all staff to read Part 1; full acknowledgement is the operational action even where introductory PDF wording distinguishes staff roles.",
    unknownExplanation: "Confirm school status and safeguarding roles.",
    expectedEvidence: [
      "Induction, update and DSL training dates",
      "Part 1 acknowledgements",
    ],
    sourceIds: ["eng-kcsie-2026"],
    signalKeys: ["personnel", "agreements"],
  }),
  englandRequirement({
    id: "eng-eyfs-suitability",
    action:
      "Verify staff suitability, qualifications, eligible checks and disqualification status, and obtain the required written reference before recruitment, including students and volunteers.",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    applicabilityExplanation:
      "Group and school-based EYFS 3.13–3.27 sets mandatory suitability and reference requirements. Check level and barred-list eligibility depend on duties and establishment; not every adult account requires screening.",
    unknownExplanation:
      "Confirm applicability of the group or school-based EYFS framework and actual roles.",
    expectedEvidence: [
      "Suitability register, verified references, role eligibility and dates",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng-eyfs-safeguarding-training",
    action:
      "Train practitioners and the designated safeguarding lead to EYFS Annex C criteria; renew training every two years and arrange appropriate staff supervision.",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    applicabilityExplanation:
      "Group and school-based EYFS 3.31–3.36 requires training, ongoing support and supervision. Annual refreshers may additionally be appropriate; the two-year renewal is specific to this framework.",
    unknownExplanation: "Confirm group or school-based EYFS applicability.",
    expectedEvidence: [
      "Training content, certificates, renewal dates and supervision arrangements",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng-eyfs-paediatric-first-aid",
    action:
      "Provide current full paediatric first-aid coverage whenever children are present and on outings; renew certification every three years and assess qualification-linked staffing requirements.",
    topic: "personnel",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    applicabilityExplanation:
      "Group and school-based EYFS 3.37–3.40 and Annex A specify coverage and training. Staff ratio eligibility depends on qualification route/date and role; no universal certificate requirement for every account.",
    unknownExplanation:
      "Confirm group or school-based EYFS applicability, staffing and outings.",
    expectedEvidence: [
      "Current certificates, premises/outing rota and qualification assessment",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng-dbs-eligibility-assessment",
    action:
      "Assess each staff or volunteer role for lawful DBS level, workforce and barred-list eligibility before requesting a check; record the outcome even where no check is eligible.",
    topic: "personnel",
    obligationClass: "RECOMMENDATION",
    condition: null,
    applicabilityExplanation:
      "This is an eligibility assessment, not universal screening. Consider duties, frequency, supervision and establishment; adult/parent account status creates no check requirement. Review existing certificates and any lawful Update Service use separately.",
    unknownExplanation:
      "Role details must be assessed individually; the site profile cannot determine DBS eligibility.",
    expectedEvidence: [
      "Role-specific eligibility rationale and verifier",
      "Certificate issue date and separately justified organisational review date; DBS certificates have no official expiry",
    ],
    sourceIds: ["eng-dbs-role-eligibility", "eng-dbs-employer-guidance"],
    signalKeys: ["personnel"],
  }),
  englandRequirement({
    id: "eng-dbs-referral-procedure",
    action:
      "Assess whether the organisation is a regulated-activity provider and document how statutory DBS referral triggers will be recognised and acted on.",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: null,
    applicabilityExplanation:
      "The underlying section 35 duty is conditional on provider status, prescribed information and withdrawal (or would/might withdraw after departure) for specified conduct/harm reasons. Dismissal alone is insufficient; resignation does not remove a qualifying duty. This checklist assesses the procedure, not an incident outcome.",
    unknownExplanation:
      "Regulated-activity status and incident facts require restricted individual assessment.",
    expectedEvidence: [
      "Provider-status assessment and referral decision procedure",
      "Restricted decision and DBS receipt if a qualifying event occurs",
    ],
    sourceIds: ["eng-svga-referral", "eng-dbs-referral-guide"],
    signalKeys: ["safeguarding"],
  }),
];
