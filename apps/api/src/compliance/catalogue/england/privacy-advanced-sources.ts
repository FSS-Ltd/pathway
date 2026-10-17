import type { TrackerCatalogue } from "../schema";
import { englandSource } from "./shared";
const currentText = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Current official text verified; original commencement of every amendment was not independently established.",
};
export const privacyAdvancedSources: TrackerCatalogue["sources"] = [
  englandSource({
    id: "eng-privacy-advanced-joint-controller",
    url: "https://www.legislation.gov.uk/eur/2016/679/article/26/data.xml",
    title: "UK GDPR Article 26: joint-controller arrangements",
    provision: "UK GDPR Article 26: joint-controller arrangements",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-advanced-transfers",
    url: "https://www.legislation.gov.uk/ukpga/2025/18/schedule/7/data.xml",
    title: "DUAA Schedule 7: Articles 44A, 45A\u2013C, 46 and 49 transfers",
    provision: "DUAA Schedule 7: Articles 44A, 45A\u2013C, 46 and 49 transfers",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-biometric-notification",
    url: "https://www.legislation.gov.uk/ukpga/2012/9/section/26/data.xml",
    title:
      "Protection of Freedoms Act section 26: notification, consent and objections",
    provision:
      "Protection of Freedoms Act section 26: notification, consent and objections",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2013-09-01", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-biometric-exceptions",
    url: "https://www.legislation.gov.uk/ukpga/2012/9/section/27/data.xml",
    title:
      "Protection of Freedoms Act section 27: exceptions and written consent",
    provision:
      "Protection of Freedoms Act section 27: exceptions and written consent",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2013-09-01", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-biometric-scope",
    url: "https://www.legislation.gov.uk/ukpga/2012/9/section/28/data.xml",
    title:
      "Protection of Freedoms Act section 28: child, institution and recognition definitions",
    provision:
      "Protection of Freedoms Act section 28: child, institution and recognition definitions",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2013-09-01", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-biometric-commencement",
    url: "https://www.legislation.gov.uk/uksi/2013/2104/article/2/data.xml",
    title: "SI 2013/2104 article 2: sections 26\u201328 commencement",
    provision: "SI 2013/2104 article 2: sections 26\u201328 commencement",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2013-09-01", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-marketing",
    url: "https://www.legislation.gov.uk/uksi/2003/2426/regulation/22/data.xml",
    title:
      "PECR regulation 22: individual-subscriber marketing and soft opt-ins",
    provision:
      "PECR regulation 22: individual-subscriber marketing and soft opt-ins",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-advanced-marketing-identity",
    url: "https://www.legislation.gov.uk/uksi/2003/2426/regulation/23/data.xml",
    title: "PECR regulation 23: sender identity and cessation address",
    provision: "PECR regulation 23: sender identity and cessation address",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-advanced-storage-access",
    url: "https://www.legislation.gov.uk/uksi/2003/2426/regulation/6/data.xml",
    title: "PECR regulation 6: storage/access prohibition and interpretation",
    provision:
      "PECR regulation 6: storage/access prohibition and interpretation",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-storage-exceptions",
    url: "https://www.legislation.gov.uk/uksi/2003/2426/schedule/A1/data.xml",
    title: "PECR Schedule A1: consent and purpose-specific exceptions",
    provision: "PECR Schedule A1: consent and purpose-specific exceptions",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-children-design",
    url: "https://www.legislation.gov.uk/ukpga/2025/18/section/81/data.xml",
    title: "DUAA section 81: Article 25 higher protection matters for children",
    provision:
      "DUAA section 81: Article 25 higher protection matters for children",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-automated-decisions",
    url: "https://www.legislation.gov.uk/ukpga/2025/18/section/80/data.xml",
    title:
      "DUAA section 80: Articles 22A\u2013D automated significant decisions",
    provision:
      "DUAA section 80: Articles 22A\u2013D automated significant decisions",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-automated-transition",
    url: "https://www.legislation.gov.uk/uksi/2026/82/regulation/5/data.xml",
    title: "SI 2026/82 regulation 5: specified earlier decisions preserved",
    provision: "SI 2026/82 regulation 5: specified earlier decisions preserved",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-commencement",
    url: "https://www.legislation.gov.uk/uksi/2026/82/regulation/2/data.xml",
    title:
      "SI 2026/82 regulation 2: sections 80, 81, 85, 112, 114 commencement",
    provision:
      "SI 2026/82 regulation 2: sections 80, 81, 85, 112, 114 commencement",
    authority: "UK legislation",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current official provision verified; original publication date not independently established.",
    effective: { from: "2026-02-05", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-privacy-advanced-charity-guidance",
    url: "https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guidance-on-direct-marketing-using-electronic-mail/how-do-we-comply-with-the-pecr-electronic-mail-marketing-rules/",
    title:
      "Electronic-mail marketing: charity soft opt-in qualifying details obtained on/after 5 February 2026",
    provision:
      "Electronic-mail marketing: charity soft opt-in qualifying details obtained on/after 5 February 2026",
    authority: "Information Commission",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current guidance verified; original publication date not established.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-advanced-children-code-scope",
    url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/introduction-to-the-childrens-code",
    title:
      "Children\u2019s Code scope: ISS likely accessed by under-18s; ordinary education records distinguished",
    provision:
      "Children\u2019s Code scope: ISS likely accessed by under-18s; ordinary education records distinguished",
    authority: "Information Commission",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current guidance verified; original publication date not established.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-advanced-children-code-status",
    url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/childrens-information/childrens-code-guidance-and-resources/age-appropriate-design-a-code-of-practice-for-online-services/about-this-code/",
    title:
      "Children\u2019s Code status: DPA sections 123 and 127; code effective 2 September 2020",
    provision:
      "Children\u2019s Code status: DPA sections 123 and 127; code effective 2 September 2020",
    authority: "Information Commission",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current guidance verified; original publication date not established.",
    effective: currentText,
  }),
  englandSource({
    id: "eng-privacy-advanced-transfer-guidance",
    url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/international-transfers/a-guide-to-international-transfers/are-we-making-a-restricted-transfer/",
    title:
      "Restricted transfer: UK GDPR processing, initiating overseas transfer and separate entity",
    provision:
      "Restricted transfer: UK GDPR processing, initiating overseas transfer and separate entity",
    authority: "Information Commission",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current guidance verified; original publication date not established.",
    effective: currentText,
  }),
];
