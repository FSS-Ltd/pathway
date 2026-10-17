import type { TrackerCatalogue } from "../schema";
import { walesSource } from "./shared";

const observedText = {
  from: null,
  to: null,
  currentAsOf: "2026-10-17",
  unknownReason:
    "Current amended UK text was read on the observation date; the original commencement of each retained or amended paragraph was not independently reconstructed.",
};

export const privacySources: TrackerCatalogue["sources"] = [
  ...[
    ["5", "Processing principles", "Article 5(1)–(3)"],
    [
      "6",
      "Lawful processing",
      "Article 6(1), (3), (5) and Annex 1 condition requirement",
    ],
    ["9", "Special-category data", "Article 9(1)–(3), (5)"],
    ["10", "Criminal-offence data", "Article 10(1)–(2)"],
    ["12", "Transparency and rights", "Article 12(1)–(6), as amended"],
    ["13", "Direct collection notices", "Article 13(1)–(4), as amended"],
    ["14", "Indirect collection notices", "Article 14(1)–(5), as amended"],
    [
      "25",
      "Data protection by design",
      "Article 25(1)–(3), including children's higher protection matters",
    ],
    ["28", "Processor arrangements", "Article 28(1)–(4), (9)–(10)"],
    [
      "30",
      "Processing records",
      "Article 30(1)–(5), including limited under-250 exemption",
    ],
    ["32", "Processing security", "Article 32(1)–(4)"],
    ["33", "Regulator breach notification", "Article 33(1)–(5)"],
    ["34", "Individual breach communication", "Article 34(1)–(3)"],
    ["35", "Impact assessment", "Article 35(1)–(3), (7), (11)"],
    ["37", "Data protection officers", "Article 37(1)–(7), as amended"],
  ].map(([article, title, provision]) =>
    walesSource({
      id: `wal-privacy-gdpr-${article}`,
      url: `https://www.legislation.gov.uk/eur/2016/679/article/${article}/data.xml`,
      title: `UK GDPR: ${title}`,
      authority: "UK legislation",
      provision,
      classification: "LEGISLATION",
      publishedAt: null,
      publishedDateUnknownReason:
        "The consolidated UK text includes changes published on different dates.",
      effective: observedText,
    }),
  ),
  walesSource({
    id: "wal-privacy-rights-period",
    url: "https://www.legislation.gov.uk/ukpga/2025/18/section/76/data.xml",
    title: "Data (Use and Access) Act 2025: request time limits",
    authority: "UK Parliament",
    provision:
      "Section 76(2)–(3), inserting UK GDPR Article 12A(1)–(6); commencement annotation: SI 2026/82 regulation 2(h)",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "The Act received Royal Assent on 19 June 2025; the exact original publication date was not verified.",
    effective: {
      from: "2026-02-05",
      to: null,
      currentAsOf: "2026-10-17",
      unknownReason: null,
    },
  }),
  walesSource({
    id: "wal-privacy-complaints",
    url: "https://www.legislation.gov.uk/ukpga/2018/12/section/164A/data.xml",
    title: "Data Protection Act 2018: complaints to controllers",
    authority: "UK Parliament",
    provision:
      "Section 164A(1)–(5); commencement annotation: DUAA section 103(2) and SI 2026/82 regulation 3(a)",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "The consolidated section was inserted by the 2025 Act; no single publication date is assigned to its amended text.",
    effective: {
      from: "2026-06-19",
      to: null,
      currentAsOf: "2026-10-17",
      unknownReason: null,
    },
  }),
  ...[
    [
      "wal-privacy-dpa-sensitive",
      "section/10",
      "Section 10(1)–(5): relevant Schedule 1 routes for Article 9 and Article 10 processing",
    ],
    [
      "wal-privacy-policy-document",
      "schedule/1/part/4",
      "Schedule 1 Part 4 paragraphs 38–41: policy-document safeguards where the selected condition requires them",
    ],
  ].map(([id, path, provision]) =>
    walesSource({
      id,
      url: `https://www.legislation.gov.uk/ukpga/2018/12/${path}/data.xml`,
      title: "Data Protection Act 2018: sensitive-data safeguards",
      authority: "UK Parliament",
      provision,
      classification: "LEGISLATION",
      publishedAt: null,
      publishedDateUnknownReason:
        "Current consolidated text includes later amendments.",
      effective: observedText,
    }),
  ),
  walesSource({
    id: "wal-privacy-fee-assessment",
    url: "https://ico.org.uk/for-organisations/data-protection-fee/data-protection-fee/exemptions/",
    title: "ICO data protection fee exemptions",
    authority: "Information Commission (ICO)",
    provision:
      "Exempt processing purposes, self-assessment and continuing data-protection obligations despite fee exemption",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "No publication day was displayed on the current exemptions page.",
    effective: {
      ...observedText,
      unknownReason:
        "Undated current regulator guidance observed; legal commencement of each fee exemption was not established.",
    },
  }),
];
