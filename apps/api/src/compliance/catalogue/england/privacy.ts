import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { englandRequirement, englandSource } from "./shared";

const currentText = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Current official text verified; commencement of every amendment to this provision has not been established.",
};
const controller: CatalogueRequirement["condition"] = {
  field: "personalDataController",
  op: "eq",
  value: true,
};
const unknownController =
  "Confirm whether the organisation determines the purposes and means of this processing. A missing controller assessment leaves applicability unresolved; processors have separate duties.";

export const privacySources: TrackerCatalogue["sources"] = [
  ...[
    ["5", "Principles relating to processing"],
    ["6", "Lawfulness of processing"],
    ["9", "Special categories of personal data"],
    ["10", "Criminal convictions and offences data"],
    ["12", "Transparent information and exercise of rights"],
    ["13", "Information at direct collection"],
    ["14", "Information at indirect collection"],
    ["25", "Data protection by design and default"],
    ["28", "Processor safeguards and contracts"],
    ["30", "Records of processing activities"],
    ["32", "Security of processing"],
    ["33", "Breach notification to the regulator"],
    ["34", "Breach communication to individuals"],
    ["35", "Data protection impact assessment"],
    ["37", "Designation of the data protection officer"],
  ].map(([article, title]) =>
    englandSource({
      id: `eng-privacy-gdpr-${article}`,
      url: `https://www.legislation.gov.uk/eur/2016/679/article/${article}/data.xml`,
      title: `UK GDPR Article ${article}: ${title}`,
      authority: "UK legislation; Information Commission regulator",
      provision: `Article ${article}, current amended UK text`,
      classification: "LEGISLATION",
      publishedAt: null,
      publishedDateUnknownReason:
        "The current consolidated provision contains amendments with different publication dates.",
      effective: currentText,
    }),
  ),
  englandSource({
    id: "eng-privacy-fee-assessment",
    url: "https://ico.org.uk/for-organisations/data-protection-fee/faqs-data-protection-fee-payment-and-online-registration",
    title: "ICO data protection fee registration FAQs",
    authority: "Information Commission",
    provision:
      "Registration self-assessment and not-for-profit exemption conditions; assessment guidance only",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "No publication date displayed on the verified current page.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-rights-period",
    url: "https://www.legislation.gov.uk/ukpga/2025/18/section/76/data.xml",
    title: "Data (Use and Access) Act 2025: rights request periods",
    authority: "UK Parliament",
    provision:
      "Section 76(2)–(3), inserting UK GDPR Article 12A; commencement annotation S.I. 2026/82 regulation 2(h)",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Royal Assent was 19 June 2025; exact original publication day was not independently verified.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-dpa-sensitive",
    url: "https://www.legislation.gov.uk/ukpga/2018/12/section/10/data.xml",
    title: "Data Protection Act 2018: sensitive processing conditions",
    authority: "UK Parliament",
    provision:
      "Section 10(1)–(5): Schedule 1 conditions for specified Article 9 and Article 10 processing",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current consolidated text includes later amendments.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-policy-document",
    url: "https://www.legislation.gov.uk/ukpga/2018/12/schedule/1/part/4/data.xml",
    title: "Data Protection Act 2018: appropriate policy documents",
    authority: "UK Parliament",
    provision:
      "Schedule 1 Part 4 paragraphs 38–41: conditional policy document and safeguards",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current consolidated text includes later amendments.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-complaints",
    url: "https://www.legislation.gov.uk/ukpga/2018/12/section/164A/data.xml",
    title: "Data Protection Act 2018: complaints to controllers",
    authority: "UK Parliament",
    provision:
      "Section 164A(1)–(5); insertion/commencement annotation S.I. 2026/82 regulation 3(a)",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Consolidated provision inserted by the 2025 Act.",
    effective: { from: "2026-06-19", to: null, unknownReason: null },
  }),
];

export const privacyRequirements: CatalogueRequirement[] = [
  englandRequirement({
    id: "eng-privacy-role-review",
    action:
      "Record who controls personal data and who processes it on another organisation's instructions.",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    applicabilityExplanation:
      "All sectors should classify their actual processing roles before selecting controller or processor duties. Sector, ACE membership and funding do not settle these roles.",
    unknownExplanation:
      "Record unresolved roles and obtain advice before treating controller duties as inapplicable.",
    expectedEvidence: [
      "Purpose and responsibility inventory, controller/processor decisions and an accountable privacy contact; do not attach live personal records.",
    ],
    sourceIds: ["eng-privacy-gdpr-5", "eng-privacy-gdpr-28"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-lawful-basis",
    action:
      "Document a lawful basis for each personal-data purpose and keep collection necessary, fair and accurate.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "Controllers must meet Articles 5 and 6. Identify the actual legal foundation for legal obligation/public task. Consent must be valid; children's interests need specific protection. Recognised legitimate interests require an Annex 1 condition, not a sector label.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Purpose/basis register, necessity and accuracy controls, and relevant statutory basis or legitimate-interest assessment.",
    ],
    sourceIds: ["eng-privacy-gdpr-5", "eng-privacy-gdpr-6"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-sensitive-review",
    action:
      "Review whether special-category or criminal-offence data is processed and document the additional conditions and safeguards where applicable.",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    applicabilityExplanation:
      "The review is recommended; underlying duties apply when relevant data is processed. Article 9 needs an Article 6 basis and an additional condition; Article 10 has separate authority requirements. DPA section 10 identifies relevant Schedule 1 routes. An appropriate policy document is required only where the chosen condition requires it; Part 4 then requires retention, review and additional records. Religion and health can be relevant across sectors.",
    unknownExplanation:
      "The profile does not establish data categories or the condition relied on; do not assume consent or safeguarding automatically authorises every use.",
    expectedEvidence: [
      "Category/condition assessment and, when required, an appropriate policy document covering principles, retention and erasure; no sensitive case details.",
    ],
    sourceIds: [
      "eng-privacy-gdpr-9",
      "eng-privacy-gdpr-10",
      "eng-privacy-dpa-sensitive",
      "eng-privacy-policy-document",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-transparency",
    action:
      "Give people clear privacy information at collection or within the applicable indirect-collection deadline.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "Articles 12–14 require understandable information, particularly for children. Direct collection information is due when data is obtained. Indirect collection is normally within a reasonable period and no later than one month, or earlier at first communication/disclosure as applicable; assess actual exceptions. Include purposes, basis, retention, recipients and complaint/rights routes.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Versioned notices, accessible child-appropriate explanations where needed and evidence of when/how information is provided.",
    ],
    sourceIds: [
      "eng-privacy-gdpr-12",
      "eng-privacy-gdpr-13",
      "eng-privacy-gdpr-14",
    ],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-rights-procedure",
    action:
      "Recognise and handle personal-data rights requests within the current Article 12A time limits.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "Respond without undue delay. Article 12A normally allows one month from the latest relevant receipt of request, necessary identity information or a lawful fee. Complexity/number of requests may justify two further months with reasons notified within the first month. A reasonably necessary Article 15 clarification pauses the relevant periods from the request day through the reply day. Do not use blanket delays; assess each right's conditions and exemptions.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Request recognition/identity procedure, deadline calculation and extension/clarification records; protect third-party information. Assess authority when someone acts for a child.",
    ],
    sourceIds: ["eng-privacy-gdpr-12", "eng-privacy-rights-period"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-complaint-procedure",
    action:
      "Provide an accessible privacy complaint route, acknowledge complaints within 30 days and investigate and communicate outcomes without undue delay.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "DPA section 164A requires controllers to facilitate complaints, acknowledge receipt within the statutory 30-day period, make appropriate enquiries, keep complainants informed and communicate outcomes without undue delay. The duty commenced on 19 June 2026; 30 days is not a universal final-resolution deadline.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Accessible complaint route and dated acknowledgement, enquiry, progress and outcome records.",
    ],
    sourceIds: ["eng-privacy-complaints"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-retention",
    action:
      "Keep identifiable personal data only as long as necessary and apply justified retention and secure disposal controls.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "Article 5 storage limitation requires purpose-specific durations, taking account of actual legal retention and preservation requirements. There is no universal GDPR seven-year period; permitted archiving/research exceptions have their own safeguards.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Category retention schedule with rationale, review owner, legal hold decisions and disposal/anonymisation controls.",
    ],
    sourceIds: ["eng-privacy-gdpr-5", "eng-privacy-gdpr-32"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-security",
    action:
      "Apply and review security and privacy safeguards appropriate to the risks of processing personal data.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "Articles 25 and 32 require appropriate technical/organisational measures and data minimisation by default. Assess confidentiality, integrity, availability, recovery and testing. Article 25 also addresses higher protection matters for covered information society services likely accessed by children; this is not every offline children's activity.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Risk assessment, access controls, recovery/testing evidence and staff instructions. Select controls proportionately rather than treating a single product or training interval as statutory.",
    ],
    sourceIds: ["eng-privacy-gdpr-25", "eng-privacy-gdpr-32"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-breach-procedure",
    action:
      "Document and assess personal-data breaches and make required regulator and individual notifications promptly.",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    applicabilityExplanation:
      "Notify the regulator without undue delay and where feasible within 72 hours of awareness unless unlikely to risk individuals' rights/freedoms; explain delay. High-risk breaches require individual communication without undue delay, subject to Article 34 exceptions. Document all breaches and non-report decisions. Processors notify controllers without undue delay.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Incident procedure, awareness timestamp, risk/reporting decisions, notification evidence and remedial actions; separate safeguarding reporting may also apply.",
    ],
    sourceIds: ["eng-privacy-gdpr-33", "eng-privacy-gdpr-34"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-privacy-accountability-review",
    action:
      "Assess processing records, supplier contracts, DPO and DPIA obligations before relying on an exemption or starting new processing.",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    applicabilityExplanation:
      "This is an assessment action, not a universal DPO/DPIA mandate. Article 30's under-250 exemption is limited: non-occasional, risky or special-category/criminal-data processing can require records. Article 28 requires safeguards/contracts when processors are used. Article 35 concerns likely-high-risk processing; Article 37 DPO triggers include public bodies and specified large-scale core activities. Assess the ICO fee separately using current processing/exemption facts; nonprofit status alone does not settle it.",
    unknownExplanation:
      "The profile lacks public-body status, scale, frequency, supplier roles, high-risk activity and fee exemption facts. Record unresolved applicability and obtain specialist review where needed.",
    expectedEvidence: [
      "ROPA/exemption assessment, supplier role/contracts review and documented DPO/DPIA/fee assessment. Public funding alone does not prove public-authority status.",
    ],
    sourceIds: [
      "eng-privacy-gdpr-28",
      "eng-privacy-gdpr-30",
      "eng-privacy-gdpr-35",
      "eng-privacy-gdpr-37",
      "eng-privacy-fee-assessment",
    ],
    signalKeys: [],
  }),
];
