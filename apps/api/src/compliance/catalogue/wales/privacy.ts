import type { CatalogueRequirement } from "../schema";
import { walesRequirement } from "./shared";

const controller: CatalogueRequirement["condition"] = {
  field: "personalDataController",
  op: "eq",
  value: true,
};
const unknownController =
  "Establish whether this organisation decides the purposes and means of the processing. Missing controller facts leave these duties unresolved; processors can have separate duties.";

export const privacyRequirements: CatalogueRequirement[] = [
  walesRequirement({
    id: "wal-privacy-role-review",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Identify the organisation's controller, joint-controller and processor roles for each personal-data activity.",
    applicabilityExplanation:
      "A recorded role assessment helps every sector identify the applicable duties. Welsh location, charitable status, public funding or participation in ACE/ICCE does not by itself decide a processing role.",
    unknownExplanation:
      "Document uncertain roles and resolve them before excluding controller or processor obligations.",
    expectedEvidence: [
      "Processing purposes, responsibility decisions and privacy contact, with unresolved roles assigned for review; exclude identifiable case records.",
    ],
    sourceIds: ["wal-privacy-gdpr-5", "wal-privacy-gdpr-28"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-lawful-basis",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Set and document a lawful basis for each purpose, with fair, necessary and accurate processing.",
    applicabilityExplanation:
      "Articles 5 and 6 apply to controllers in Wales. Identify the actual law for legal-obligation/public-task processing; do not substitute sector labels. Recognised legitimate interests require an Annex 1 condition. Ordinary legitimate interests require the rights balance, particularly for children; valid consent is only one possible basis.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Purpose and lawful-basis register, necessity/accuracy controls and supporting legal basis, consent records or relevant interest assessment.",
    ],
    sourceIds: ["wal-privacy-gdpr-5", "wal-privacy-gdpr-6"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-notices",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Provide clear privacy information when collecting personal data and meet the applicable timing rules for indirect collection.",
    applicabilityExplanation:
      "Articles 12–14 require accessible, understandable notices, with particular care for information addressed to children. Direct collection normally requires information at collection. For indirect collection, assess the one-month outer limit and earlier first-contact/disclosure triggers, together with actual exceptions. Explain purposes, basis, recipients, retention and rights/complaint routes.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Dated notice versions and delivery methods, child-appropriate explanations when needed, indirect-collection timing/exception decisions.",
    ],
    sourceIds: [
      "wal-privacy-gdpr-12",
      "wal-privacy-gdpr-13",
      "wal-privacy-gdpr-14",
    ],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-rights-requests",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Recognise data-rights requests and calculate and meet the current Article 12A response periods.",
    applicabilityExplanation:
      "Act without undue delay, normally within one month of the latest relevant request, necessary identity information or lawful fee. A necessary complexity/number extension allows two further months, with reasons notified during the initial month. Reasonably required Article 15 clarification pauses the relevant periods through receipt of the answer. Assess exemptions and representation of children individually.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Request/identity procedure, receipt and deadline records, justified extensions or clarification pauses, responses and protected third-party information.",
    ],
    sourceIds: ["wal-privacy-gdpr-12", "wal-privacy-rights-period"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-complaints-process",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Make privacy complaints accessible, acknowledge them within 30 days and respond and communicate outcomes without undue delay.",
    applicabilityExplanation:
      "DPA section 164A applies from 19 June 2026. Facilitate complaints, acknowledge receipt within the 30-day period beginning when received, investigate appropriately and keep the complainant informed. The acknowledgement period is not a blanket deadline for final resolution.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Accessible complaint channels, receipt/acknowledgement dates, proportionate enquiry and progress records, outcome and corrective actions.",
    ],
    sourceIds: ["wal-privacy-complaints"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-retention",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Apply justified retention periods and secure disposal or anonymisation to personal records.",
    applicabilityExplanation:
      "Article 5 limits identifiable storage to the necessary purpose, subject to the actual statutory retention, preservation and safeguarded archiving/research exceptions. Welsh institutional records may have separate retention rules; GDPR supplies no universal seven-year period.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Record-category retention schedule and rationale, owners, preservation decisions and disposal/anonymisation records.",
    ],
    sourceIds: ["wal-privacy-gdpr-5", "wal-privacy-gdpr-32"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-security",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Implement and review proportionate security and data protection by design and default.",
    applicabilityExplanation:
      "Articles 25 and 32 require risk-appropriate technical and organisational safeguards, necessary access/data by default, resilience, recovery and testing. Article 25's higher protection matters apply where an information society service is likely to be accessed by children; they are not a blanket rule for every offline activity.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Documented processing risks, access and default controls, recovery/testing results, supplier safeguards and staff instructions.",
    ],
    sourceIds: ["wal-privacy-gdpr-25", "wal-privacy-gdpr-32"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-breach-response",
    topic: "privacy_records",
    obligationClass: "STATUTORY_DUTY",
    condition: controller,
    action:
      "Record and assess personal-data breaches and make the notifications required by their risk.",
    applicabilityExplanation:
      "Article 33 requires regulator notification without undue delay and, where feasible, within 72 hours of awareness unless risk to individuals is unlikely; explain late notification. Article 34 requires communication without undue delay for high-risk breaches, subject to its exceptions. Record every breach and reporting decision. A processor informs its controller without undue delay.",
    unknownExplanation: unknownController,
    expectedEvidence: [
      "Incident process, awareness timestamps, risk/non-report decisions, required notification records and remedial controls; retain sensitive incident detail securely.",
    ],
    sourceIds: ["wal-privacy-gdpr-33", "wal-privacy-gdpr-34"],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-sensitive-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess special-category and criminal-offence processing and document the conditions and safeguards actually required.",
    applicabilityExplanation:
      "The assessment is recommended because the profile does not identify data categories. When present, Article 9 needs an Article 6 basis plus its additional condition; Article 10 has distinct authority safeguards. DPA section 10 identifies Schedule 1 routes. An appropriate policy document is required where the selected route says so, with Part 4 safeguards. Do not assume that consent, religious purpose or safeguarding authorises every use.",
    unknownExplanation:
      "Identify actual health, religion, criminal-offence or other sensitive processing and the route relied on before deciding which additional duties apply.",
    expectedEvidence: [
      "Data-category and legal-condition assessment, required policy document and safeguards, unresolved questions and follow-up; exclude raw health or criminal records.",
    ],
    sourceIds: [
      "wal-privacy-gdpr-9",
      "wal-privacy-gdpr-10",
      "wal-privacy-dpa-sensitive",
      "wal-privacy-policy-document",
    ],
    signalKeys: [],
  }),
  walesRequirement({
    id: "wal-privacy-accountability-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: controller,
    action:
      "Assess processing-record, supplier-contract, DPO, DPIA and regulator-fee obligations using the organisation's actual activities.",
    applicabilityExplanation:
      "This assessment does not impose a DPO, DPIA or full processing register on every institution. Article 30's small-organisation exception is limited by non-occasional, risky or sensitive processing. Article 28 governs engaged processors; Article 35 concerns likely high risk; Article 37 has public-body and specified large-scale core-activity triggers. Assess fee exemptions separately: nonprofit status or fee exemption does not remove wider privacy duties.",
    unknownExplanation:
      "The profile lacks actual processing frequency, scale, public-body status, suppliers, high-risk uses and fee-exemption facts. Record decisions and resolve missing facts rather than assuming exemption.",
    expectedEvidence: [
      "ROPA/exemption assessment, processor due diligence and written terms where required, DPO/DPIA/fee decisions and necessary follow-up controls.",
    ],
    sourceIds: [
      "wal-privacy-gdpr-28",
      "wal-privacy-gdpr-30",
      "wal-privacy-gdpr-35",
      "wal-privacy-gdpr-37",
      "wal-privacy-fee-assessment",
    ],
    signalKeys: [],
  }),
];
