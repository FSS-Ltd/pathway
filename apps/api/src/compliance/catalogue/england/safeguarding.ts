import type { Condition } from "../conditions";
import { englandRequirement, englandSource } from "./shared";

import { school, independentSchool, earlyYears } from "./conditions";
const children: Condition = { field: "minimumAge", op: "lte", value: 17 };
const unknownCommencement = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Current official guidance verified; publication or revision does not establish commencement of every underlying duty.",
};
export const safeguardingSources = [
  englandSource({
    id: "eng-school-force-recording",
    url: "https://www.legislation.gov.uk/ukpga/2006/40/section/93A",
    title: "Education and Inspections Act 2006, section 93A",
    authority: "UK Parliament",
    provision:
      "Subsections 1–7: significant force incidents, prompt written records, parent notification and significant-harm exceptions; commencement annotation SI 2025/1341 article 2",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original publication date of the amended provision not independently established.",
    effective: { from: "2026-04-01", to: null, unknownReason: null },
  }),

  englandSource({
    id: "eng-kcsie-2026",
    url: "https://assets.publishing.service.gov.uk/media/6ac3c09c11ed58342ad8e4ac/Keeping_children_safe_in_education_2026.pdf",
    title: "Keeping children safe in education 2026",
    authority: "Department for Education",
    provision:
      "Parts 1–4; paragraphs 123–130, 150, 153–154, 173–177, 302–313, 347–357; Annex B",
    classification: "GUIDANCE",
    publishedAt: "2026-07-07",
    publishedDateUnknownReason: null,
    effective: { from: "2026-09-01", to: null, unknownReason: null },
  }),

  englandSource({
    id: "eng-working-together-2026",
    url: "https://assets.publishing.service.gov.uk/media/69b995106736ec37c8a4669f/Working_together_to_safeguard_children_2026_.pdf",
    title: "Working Together to Safeguard Children 2026",
    authority: "Department for Education",
    provision: "Chapter 2 paragraphs 74, 86–88; Chapter 4 paragraphs 354–360",
    classification: "GUIDANCE",
    publishedAt: "2026-03-18",
    publishedDateUnknownReason: null,
    effective: unknownCommencement,
  }),
  englandSource({
    id: "eng-oos-safeguarding",
    url: "https://assets.publishing.service.gov.uk/media/6986066acfe7ccf77efbc75b/After-school_clubs__community_activities__and_tuition_-_Safeguarding_guidance_for_providers.pdf",
    title: "Out-of-school settings: safeguarding guidance for providers",
    authority: "Department for Education",
    provision:
      "Sections 2–4: health and safety, child protection, suitable people; scope exclusions",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "February 2026 document; landing-page update on 9 February differs from document history on 2 February. Exact issue day not established.",
    effective: unknownCommencement,
  }),
  englandSource({
    id: "eng-charity-safeguarding",
    url: "https://www.gov.uk/guidance/safeguarding-and-protecting-people-for-charities-and-trustees",
    title: "Safeguarding and protecting people for charities and trustees",
    authority: "Charity Commission for England and Wales",
    provision:
      "Manage the risks; Policies, procedures and practices; Handle and report incidents and concerns; updated 8 October 2026",
    classification: "GUIDANCE",
    publishedAt: "2017-12-06",
    publishedDateUnknownReason: null,
    effective: unknownCommencement,
  }),

  englandSource({
    id: "eng-iss-restraint-amendment",
    url: "https://www.legislation.gov.uk/uksi/2025/1348/regulation/1",
    title:
      "Schools (Recording and Reporting of Seclusion and Restraint) (England) Regulations 2025",
    authority: "Department for Education",
    provision:
      "Regulation 1(2)(b): commencement of substantive amendments, including regulation 7 amending ISS",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Publication date not separately established from made and commencement dates.",
    effective: { from: "2026-04-01", to: null, unknownReason: null },
  }),
];

function schoolAction(id: string, action: string, evidence: string[]) {
  return englandRequirement({
    id,
    action,
    topic: "safeguarding",
    obligationClass: "STATUTORY_GUIDANCE",
    condition: school,
    applicabilityExplanation:
      "Actual school classification brings this setting within KCSIE. Product sector, ACE membership and funding alone do not establish school status.",
    unknownExplanation:
      "Confirm the actual registered provider and school category.",
    expectedEvidence: evidence,
    sourceIds: ["eng-kcsie-2026"],
    signalKeys: ["safeguarding"],
  });
}
export const safeguardingRequirements = [
  englandRequirement({
    id: "eng-school-force-recording",
    action:
      "Implement procedures to record each significant use-of-force incident in writing and report it promptly to parents, subject to statutory exceptions.",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    applicabilityExplanation:
      "Education and Inspections Act 2006 section 93A requires recording as soon as practicable and reporting to each parent as soon as practicable. Apply the age-20 and likely-significant-harm exceptions; where no parent can safely receive the report, inform the pupil's ordinarily resident local authority. Not every physical contact is a significant incident.",
    unknownExplanation:
      "Confirm actual school classification; individual incident and harm decisions remain restricted.",
    expectedEvidence: [
      "Approved procedure, staff briefing and restricted incident-record/reporting audit",
    ],
    sourceIds: ["eng-school-force-recording"],
    signalKeys: ["safeguarding"],
  }),

  schoolAction(
    "eng-school-protection-policy",
    "Approve and implement child protection and staff-conduct policies; include child-on-child abuse, local reporting routes and annual policy review.",
    ["Approved policies, review date and staff communication record"],
  ),
  schoolAction(
    "eng-school-dsl",
    "Appoint a senior designated safeguarding lead with authority, resources and effective cover.",
    ["Named DSL, role description and cover arrangements"],
  ),
  schoolAction(
    "eng-school-referrals",
    "Maintain confidential child-concern, allegation and low-level-concern procedures, including local authority designated officer liaison and secure child-protection file transfer within KCSIE timescales.",
    [
      "Restricted procedures and local contacts",
      "Transfer receipt and timing review; do not upload case details to this checklist",
    ],
  ),
  schoolAction(
    "eng-school-filtering",
    "Review online filtering and monitoring effectiveness at least annually and address identified risks.",
    ["Dated review, assigned responsibilities and remediation record"],
  ),
  englandRequirement({
    id: "eng-eyfs-protection",
    action:
      "Implement safeguarding and whistleblowing procedures, designate the safeguarding lead and control device use.",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    applicabilityExplanation:
      "Confirmed group or school-based EYFS provision: mandatory welfare requirements 3.4–3.8. Childminders require their separate framework.",
    unknownExplanation:
      "Confirm whether the group or school-based EYFS framework applies, including registration or exemption.",
    expectedEvidence: [
      "Lead appointment, policies, staff briefing and device rules",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["safeguarding"],
  }),
  englandRequirement({
    id: "eng-eyfs-referrals",
    action:
      "Maintain immediate child-welfare referral procedures and required allegation notifications to Ofsted or the childminder agency within the applicable 14-day limit.",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: earlyYears,
    applicabilityExplanation:
      "EYFS 3.9 requires immediate social-care notification and police contact in emergencies. Under 3.10, registered providers notify specified allegations and action taken as soon as reasonably practicable and within 14 days; identify the registration route.",
    unknownExplanation:
      "Confirm group or school-based EYFS applicability and regulator.",
    expectedEvidence: [
      "Local reporting contacts and notification procedure",
      "Restricted notification log and receipt where relevant",
    ],
    sourceIds: ["eng-eyfs-framework"],
    signalKeys: ["safeguarding"],
  }),
  englandRequirement({
    id: "eng-child-facing-local-arrangements",
    action:
      "Assess safeguarding responsibilities and local partnership arrangements; establish referral and escalation contacts and check whether this organisation is a named relevant agency.",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: children,
    applicabilityExplanation:
      "Child-facing institutions should document their responsibilities under Working Together. A duty to cooperate depends on actual statutory scope or naming; this does not make every provider a Children Act section 11 body.",
    unknownExplanation:
      "Confirm ages served and obtain the local safeguarding partnership arrangements.",
    expectedEvidence: [
      "Local arrangement and naming assessment",
      "Named accountable person, trained staff and referral contacts",
    ],
    sourceIds: ["eng-working-together-2026"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  englandRequirement({
    id: "eng-out-of-school-safeguarding",
    action:
      "Document and rehearse child-protection, staff-conduct, whistleblowing and allegations routes; nominate a trained lead and review policies annually and after incidents.",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: {
      all: [
        children,
        { field: "providerCategory", op: "eq", value: "OUT_OF_SCHOOL" },
      ],
    },
    applicabilityExplanation:
      "DfE recommendations for out-of-school provision. Check the guidance exclusions for schools, registered alternative provision and registered childcare before using it as the setting's principal framework.",
    unknownExplanation:
      "Confirm out-of-school classification, ages and registration/exemption status.",
    expectedEvidence: [
      "Scope assessment, reviewed policy, lead training and concerns routes",
    ],
    sourceIds: ["eng-oos-safeguarding"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  englandRequirement({
    id: "eng-charity-safeguarding-oversight",
    action:
      "Record trustee oversight of safeguarding risks, suitable people, annual policy review, safe online practice and incident-reporting decisions.",
    topic: "safeguarding",
    obligationClass: "RECOMMENDATION",
    condition: { field: "charitable", op: "eq", value: true },
    applicabilityExplanation:
      "Commission guidance explains trustees' underlying duties to protect everyone contacting the charity, including adults. Confirm exempt/excepted status and the relevant regulator; charity reporting never replaces police or social-care referrals.",
    unknownExplanation:
      "Confirm actual charitable status; sector and faith labels are not proof.",
    expectedEvidence: [
      "Trustee minutes, risk register and reviewed policy",
      "Reporting rationale and applicable regulator assessment",
    ],
    sourceIds: ["eng-charity-safeguarding"],
    signalKeys: ["safeguarding", "personnel"],
  }),
  englandRequirement({
    id: "eng-independent-school-safeguarding",
    action:
      "Demonstrate effective pupil safeguarding arrangements that have regard to current Secretary of State guidance.",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    applicabilityExplanation:
      "Independent School Standards Schedule paragraph 7 applies to actual independent schools, including ACE schools.",
    unknownExplanation:
      "Confirm whether this institution legally operates an independent school.",
    expectedEvidence: [
      "Proprietor oversight and evidence of implemented safeguarding arrangements",
    ],
    sourceIds: ["eng-independent-school-standards", "eng-kcsie-2026"],
    signalKeys: ["safeguarding"],
  }),
  englandRequirement({
    id: "eng-independent-school-restraint",
    action:
      "Implement seclusion and restraint recording procedures and prompt parent reporting, applying statutory significant-harm and age exceptions.",
    topic: "safeguarding",
    obligationClass: "STATUTORY_DUTY",
    condition: independentSchool,
    applicabilityExplanation:
      "Current ISS paragraphs 16A and 32A require records as soon as practicable and information to each parent as soon as practicable, subject to pupil age 20+ and significant-harm exceptions. Where no parent can safely be informed, notify the ordinarily resident local authority. Includes supply staff and volunteers.",
    unknownExplanation:
      "Confirm legal school category; actual incidents and exceptions require restricted review.",
    expectedEvidence: [
      "Current procedure, staff briefing and restricted recording/reporting audit",
    ],
    sourceIds: [
      "eng-independent-school-standards",
      "eng-iss-restraint-amendment",
    ],
    signalKeys: ["safeguarding"],
  }),
];
