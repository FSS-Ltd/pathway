import type { Condition } from "../conditions";
import { englandRequirement, englandSource } from "./shared";
const icce: Condition = { field: "icce", op: "eq", value: true };
const currentProviderText = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Provider page is undated; current public requirements verified on the observation date. Actual entity status and applicable regional terms require external evidence.",
};
const pages = [
  [
    "eng-icce-registration",
    "https://www.icce.education/school-hea-registration",
    "ICCE School/HEA Registration",
    "Becoming and maintaining registration: application, key staff, quality visit, initial five-year full registration and renewal",
  ],
  [
    "eng-icce-training",
    "https://www.icce.education/training",
    "ICCE Training",
    "Initial and ongoing training; Procedures & QA, first-line markers, prescribed annual CPD and regional renewal requirements",
  ],
  [
    "eng-icce-enrolment",
    "https://www.icce.education/enrolling-students",
    "ICCE Enrolling Students",
    "Registered entity coordinator, separate certificate enrolment, student ID, approved academic projection before work and minimum enrolment periods",
  ],
  [
    "eng-icce-moderation",
    "https://www.icce.education/moderation-1",
    "ICCE Moderation",
    "Identifying Internal Moderators; Internal Moderation Process; External Moderation",
  ],
] as const;
export const icceSources = [
  ...pages.map(([id, url, title, provision]) =>
    englandSource({
      id,
      url,
      title,
      provision,
      authority: "International Certificate of Christian Education",
      classification: "PROVIDER",
      publishedAt: null,
      publishedDateUnknownReason:
        "Public provider page has no verified publication day.",
      effective: currentProviderText,
    }),
  ),
  englandSource({
    id: "eng-ace-provider-context",
    url: "https://www.christian.education/schools",
    title: "Christian Schools in Europe",
    authority: "Christian Education Europe",
    provision:
      "Schools and learning-centre support; discovery context, not a substitute for the institution's current agreement",
    classification: "PROVIDER",
    publishedAt: null,
    publishedDateUnknownReason:
      "Public provider page has no verified publication day.",
    effective: {
      ...currentProviderText,
      unknownReason:
        "Current public provider context verified; no contractual commencement or complete institutional agreement was available.",
    },
  }),
];
export const icceRequirements = [
  englandRequirement({
    id: "eng.icce-registration",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Hold active ICCE School/HEA registration and retain its external decision, entity ID and applicable renewal arrangements.",
    applicabilityExplanation:
      "Institutions offering ICCE must be registered with ICCE and meet applicable local education registration. Full registration initially lasts five years subject to maintained standards, followed by renewal assessment. Record visits, remediation and actual status; portal records do not establish external approval.",
    unknownExplanation:
      "Confirm ICCE participation and the entity's actual registration decision and regional terms. ACE participation alone is insufficient.",
    expectedEvidence: [
      "External registration/status decision, entity ID and regional agreement",
      "Renewal/quality-visit plan and completed remediation",
    ],
    sourceIds: ["eng-icce-registration"],
    signalKeys: ["ace"],
  }),
  englandRequirement({
    id: "eng.icce-role-training",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Verify role-specific ICCE training, annual prescribed CPD and renewal against the applicable regional requirements.",
    applicabilityExplanation:
      "Coordinators and moderators pass Procedures & QA before registration; first-line markers require marking training. The public requirements specify prescribed annual 10-hour CPD and regional training renewal. Confirm the role and current regional terms rather than imposing the same course cycle on every portal user.",
    unknownExplanation:
      "Confirm ICCE participation, actual roles, course approvals and regional renewal terms.",
    expectedEvidence: [
      "Named roles, approved training and CPD records",
      "Regional refresher schedule and completed renewals",
    ],
    sourceIds: ["eng-icce-training"],
    signalKeys: ["ace", "personnel"],
  }),
  englandRequirement({
    id: "eng.icce-enrolment-projection",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Enrol each certificate through the registered coordinator and obtain ICCE approval of its academic projection before certificate work starts.",
    applicabilityExplanation:
      "Keep the unique student ID, separate enrolment for each certificate, approved projection and applicable minimum enrolment period. A projection entered in the portal is supporting evidence, not ICCE approval.",
    unknownExplanation:
      "Confirm ICCE participation, certificate route and external enrolment/projection decisions.",
    expectedEvidence: [
      "Certificate enrolment and ICCE approval/date of projection",
      "Student-ID mapping and applicable minimum-period assessment; keep identifying evidence private",
    ],
    sourceIds: ["eng-icce-enrolment"],
    signalKeys: ["ace"],
  }),
  englandRequirement({
    id: "eng.icce-moderation",
    topic: "ace_icce",
    obligationClass: "PROVIDER_REQUIREMENT",
    condition: icce,
    action:
      "Use the approved entity-linked internal moderator, complete required random original-test sampling and submit anonymised work for external moderation.",
    applicabilityExplanation:
      "The trained moderator's approval is entity-specific. Moderate one original test per six-test unit or two per twelve-test unit, covering all units; copied tests require ICCE approval. Address deviations and submit coursework/moderated tests using the ICCE student ID with names redacted. Portal moderation status is not an external decision.",
    unknownExplanation:
      "Confirm ICCE participation, moderator approval, applicable procedures and actual external submissions.",
    expectedEvidence: [
      "Moderator approval, sampling/deviation records and remediation",
      "Anonymised submission receipts and external decisions; no public clinical or pupil details",
    ],
    sourceIds: ["eng-icce-moderation"],
    signalKeys: ["ace"],
  }),
  englandRequirement({
    id: "eng.ace-current-agreement",
    topic: "ace_icce",
    obligationClass: "RECOMMENDATION",
    condition: { field: "ace", op: "eq", value: true },
    action:
      "Obtain the institution's current ACE provider agreement and record applicable registration, training, renewal and campus conditions.",
    applicabilityExplanation:
      "ACE-only institutional terms were not fully available in the reviewed public material. Obtain and review the applicable current agreement; do not import US newsletters or household terms. ICCE duties are selected separately by actual participation. This action does not make the unreviewed provider terms complete.",
    unknownExplanation:
      "Confirm ACE participation and the actual regional institutional agreement.",
    expectedEvidence: [
      "Current provider agreement/version and documented obligations review",
      "External correspondence resolving missing or unclear conditions",
    ],
    sourceIds: ["eng-ace-provider-context"],
    signalKeys: ["ace", "agreements"],
  }),
];
