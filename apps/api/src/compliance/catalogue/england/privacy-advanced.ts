import type { CatalogueRequirement } from "../schema";
import { englandRequirement } from "./shared";

const controller: CatalogueRequirement["condition"] = {
  field: "personalDataController",
  op: "eq",
  value: true,
};
type Assessment = Pick<
  CatalogueRequirement,
  | "id"
  | "action"
  | "applicabilityExplanation"
  | "expectedEvidence"
  | "sourceIds"
> & { condition?: CatalogueRequirement["condition"] };
function assessment(input: Assessment): CatalogueRequirement {
  return englandRequirement({
    ...input,
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: input.condition === undefined ? controller : input.condition,
    unknownExplanation:
      input.condition === null
        ? "The profile does not establish the actual activity, processing role or responsible party. Assess the relevant scope independently of controller status and retain unresolved facts."
        : "Confirm the actual controller role first. The profile does not establish the systems, recipients or processing involved; record unresolved facts rather than assume conditional duties are inapplicable.",
    signalKeys: [],
  });
}

export const privacyAdvancedRequirements: CatalogueRequirement[] = [
  assessment({
    id: "eng-privacy-joint-controller-review",
    action:
      "Assess shared decision-making over personal data and document joint-controller responsibilities where required.",
    applicabilityExplanation:
      "This assessment complements the supplier-contract review. Article 26 applies when parties jointly determine purposes and means, not every disclosure to another controller. Where applicable, allocate responsibilities transparently, including notices and rights, and make the arrangement's essence available to individuals. People retain rights against either controller. Actual roles prevail over supplier labels; Article 28 separately governs processors.",
    expectedEvidence: [
      "Recipient/role assessment; joint-controller arrangement and accessible summary where applicable, or documented reasons no joint control exists. Record unresolved roles and required remediation.",
    ],
    sourceIds: ["eng-privacy-advanced-joint-controller", "eng-privacy-gdpr-28"],
  }),
  assessment({
    id: "eng-privacy-transfer-review",
    condition: null,
    action:
      "Map overseas recipients and access, assess restricted transfers and implement the required transfer route and safeguards.",
    applicabilityExplanation:
      "The assessment is recommended for both controllers and processors; either can initiate a restricted transfer. Identify the actual role, UK GDPR processing, initiation of a transfer outside the UK and a separate receiving entity. Unresolved roles or initiators must be investigated before confirmation. Overseas remote access can count; hosting location alone does not settle the test. For relevant transfers, Article 44A requires current approval regulations, appropriate safeguards or a valid specific-situation derogation, alongside other GDPR duties. Under amended Article 46, reasonably and proportionately assess whether post-transfer protection is not materially lower. A processor contract alone is insufficient. Changes took effect on 5 February 2026.",
    expectedEvidence: [
      "Entity/country/access map, transfer initiator and route assessment; current approval scope or safeguards instrument and documented data-protection test, necessary extra controls or justified derogation. Where no restricted transfer is initiated, record which test is not met and the supporting entity/access evidence; an unavailable safeguard is not a no-transfer finding. Unknown destinations or initiators remain unresolved.",
    ],
    sourceIds: [
      "eng-privacy-advanced-transfers",
      "eng-privacy-advanced-transfer-guidance",
      "eng-privacy-advanced-commencement",
    ],
  }),
  assessment({
    id: "eng-privacy-biometric-review",
    action:
      "Assess biometric recognition use and apply the education-specific consent, objection and alternative-access rules where required.",
    applicabilityExplanation:
      "This is an assessment, not a requirement to use biometrics. Sections 26–28 apply to under-18 biometric recognition by/on behalf of the relevant authority of a school, 16–19 Academy or further-education institution. Actual legal status matters, not ACE or a learning-centre screen. Notify each parent before first processing subject to statutory exceptions, obtain written consent from at least one and honour parental objections/withdrawals. A child's refusal overrides parental consent; provide reasonable alternative service access. Check section 27 exceptions and section 28 care arrangements. These rules, effective 1 September 2013, supplement GDPR rather than replace its lawful-basis/sensitive-data requirements; not every photograph is biometric recognition.",
    expectedEvidence: [
      "System, age and institution assessment; where applicable, notification/written consent, objections and stop-processing procedure, documented statutory exceptions and alternative access. Record a substantiated non-use/out-of-scope outcome without uploading pupil biometric data.",
    ],
    sourceIds: [
      "eng-privacy-advanced-biometric-notification",
      "eng-privacy-advanced-biometric-exceptions",
      "eng-privacy-advanced-biometric-scope",
      "eng-privacy-advanced-biometric-commencement",
      "eng-privacy-gdpr-9",
    ],
  }),
  assessment({
    id: "eng-privacy-electronic-marketing-review",
    condition: null,
    action:
      "Review electronic marketing and implement the applicable consent, soft-opt-in and unsubscribe controls.",
    applicabilityExplanation:
      "Assess sending or instigating marketing regardless of GDPR controller status. Distinguish marketing from genuine administrative messages and individual from corporate subscribers. PECR regulation 22 generally requires consent for unsolicited individual-subscriber electronic marketing unless an exact exception applies. The products/services soft opt-in requires directly obtained sale/negotiation details, own similar offerings and collection/each-message opt-out. The charity route requires actual legal charity status, qualifying directly obtained interest/support details, sole furtherance of own charitable purposes and both opt-outs; ICO limits it to qualifying details obtained on/after 5 February 2026. Do not grandfather old lists. Regulation 23 requires sender identity and a cessation address. GDPR lawful basis does not replace PECR consent; telephone marketing has separate rules outside this action.",
    expectedEvidence: [
      "Campaign/subscriber classification, contact provenance and date, applicable route, consent or soft-opt-in evidence, suppression/unsubscribe tests and sender identification. Document non-marketing/no-activity conclusions and unresolved list provenance.",
    ],
    sourceIds: [
      "eng-privacy-advanced-marketing",
      "eng-privacy-advanced-marketing-identity",
      "eng-privacy-advanced-charity-guidance",
      "eng-privacy-advanced-commencement",
    ],
  }),
  assessment({
    id: "eng-privacy-storage-access-review",
    condition: null,
    action:
      "Inventory website/app storage and access technologies and implement consent or the exact applicable exception.",
    applicabilityExplanation:
      "The recommended review covers cookies and other storage/access, including information that is not personal data. Since 5 February 2026, PECR regulation 6 and Schedule A1 permit informed consent or purpose-specific communication, strict necessity, statistics, appearance/functionality or emergency exceptions. Statistics must solely support service/site improvement, restrict sharing and provide clear information and free simple objection that is honoured; its exception excludes collecting automatically emitted information. Appearance/functionality also requires clear information and objection. Not all analytics are exempt. Assess each technology/purpose and mixed uses; no technology use means no corresponding operational duty.",
    expectedEvidence: [
      "Technology/third-party tag inventory and purpose assessment, notices, consent or exception rationale, objection controls and tested behaviour before/after choices. Record unknown third-party purposes for resolution.",
    ],
    sourceIds: [
      "eng-privacy-advanced-storage-access",
      "eng-privacy-advanced-storage-exceptions",
      "eng-privacy-advanced-commencement",
    ],
  }),
  assessment({
    id: "eng-privacy-children-online-review",
    action:
      "Assess children's online-service scope and implement age-appropriate design controls where applicable.",
    applicabilityExplanation:
      "Ordinary school education records do not automatically put a service within the Children's Code. Assess information society services normally remunerated, provided electronically at distance on individual request and likely accessed by under-18s; relevant online education services can qualify. Article 25's child-protection assessment duties, effective 5 February 2026, consider protection/support, reduced risk/rights awareness and developmental needs. Its ISS definition excludes preventive/counselling services; ordinary GDPR safeguards still apply. The Children's Code is a statutory code effective 2 September 2020, considered under DPA section 127, not an independent offence for every recommended design detail. Assess vendors' actual roles and uses. A DPIA is required only when its own legal trigger is met.",
    expectedEvidence: [
      "Service/business-model and likely-age/access assessment; applicable design controls, privacy defaults and understandable notices; risk and supplier review. Document non-ISS reasoning or unresolved service scope.",
    ],
    sourceIds: [
      "eng-privacy-advanced-children-design",
      "eng-privacy-advanced-children-code-scope",
      "eng-privacy-advanced-children-code-status",
      "eng-privacy-advanced-commencement",
      "eng-privacy-gdpr-35",
    ],
  }),
  assessment({
    id: "eng-privacy-automated-decision-review",
    action:
      "Identify significant solely automated decisions and implement applicable restrictions and human challenge safeguards.",
    applicabilityExplanation:
      "Articles 22A–D replaced the former general rule on 5 February 2026. Assess legal/similarly significant effects and whether human involvement is meaningful, not ceremonial. Article 22B restricts special-category decisions to its precise exceptions and prevents relevant solely automated significant decisions relying entirely/partly on Article 6(1)(ea). Article 22C requires information, representations, human intervention and contest mechanisms. Other GDPR duties remain. SI 2026/82 regulation 5 preserves specified earlier decisions; do not rewrite their history. AI branding, reminders or a manual checklist do not alone meet these tests. Check current supplementary Article 22D rules before deploying a significant-decision feature.",
    expectedEvidence: [
      "Decision inventory, impact/data/lawful-basis assessment, meaningful human-review design, notices and tested challenge route; decision dates and historical treatment. Record non-use or unresolved decision effects without uploading individual outcomes.",
    ],
    sourceIds: [
      "eng-privacy-advanced-automated-decisions",
      "eng-privacy-advanced-automated-transition",
      "eng-privacy-advanced-commencement",
    ],
  }),
];
