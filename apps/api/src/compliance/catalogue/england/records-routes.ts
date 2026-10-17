import type { CatalogueRequirement, TrackerCatalogue } from "../schema";
import { englandRequirement, englandSource } from "./shared";

const currentText = {
  from: null,
  to: null,
  currentAsOf: "2026-10-15",
  unknownReason:
    "Current consolidated text verified; original and individual amendment commencement dates are not all established.",
};
const publicationUnknown = {
  publishedAt: null,
  publishedDateUnknownReason:
    "Current official text verified; original publication day not independently established.",
};

export const recordsRouteSources: TrackerCatalogue["sources"] = [
  englandSource({
    id: "eng-records-parental-access",
    url: "https://www.legislation.gov.uk/uksi/2005/1437/regulation/5/data.xml",
    title: "Education (Pupil Information) (England) Regulations 2005: access",
    authority: "UK legislation",
    classification: "LEGISLATION",
    provision:
      "Regulation 5: maintained non-nursery and non-maintained special-school scope, parental inspection/copies, lawful exclusions and admission-related curricular transfer",
    ...publicationUnknown,
    effective: currentText,
  }),
  englandSource({
    id: "eng-records-curricular",
    url: "https://www.legislation.gov.uk/uksi/2005/1437/regulation/4/data.xml",
    title:
      "Education (Pupil Information) (England) Regulations 2005: curricular records",
    authority: "UK legislation",
    classification: "LEGISLATION",
    provision:
      "Regulation 4: covered schools keep curricular records updated at least once each school year; not a one-year retention limit",
    ...publicationUnknown,
    effective: currentText,
  }),
  englandSource({
    id: "eng-records-transfer",
    url: "https://www.legislation.gov.uk/uksi/2005/1437/regulation/9/data.xml",
    title:
      "Education (Pupil Information) (England) Regulations 2005: school transfers",
    authority: "UK legislation",
    classification: "LEGISLATION",
    provision:
      "Regulation 9: maintained-school transfer, dual-registration, request deadlines and exceptions",
    ...publicationUnknown,
    effective: currentText,
  }),
  englandSource({
    id: "eng-records-register-retention",
    url: "https://www.legislation.gov.uk/uksi/2024/208/regulation/7/data.xml",
    title:
      "School Attendance (Pupil Registration) (England) Regulations 2024: preservation",
    authority: "UK legislation",
    classification: "LEGISLATION",
    provision:
      "Regulation 7: entries six years from entry; required backups six years after relevant school-year end; commencement verified in regulation 1",
    ...publicationUnknown,
    effective: { from: "2024-08-19", to: null, unknownReason: null },
  }),
  englandSource({
    id: "eng-records-education-exemptions",
    url: "https://www.legislation.gov.uk/ukpga/2018/12/schedule/3/part/4/data.xml",
    title: "Data Protection Act 2018: education data",
    authority: "UK legislation",
    classification: "LEGISLATION",
    provision:
      "Schedule 3 Part 4, paragraphs 14, 17 and 19: broader school-record definition, health-data distinction and limited serious-harm restriction",
    ...publicationUnknown,
    effective: currentText,
  }),
  englandSource({
    id: "eng-records-limitation",
    url: "https://www.legislation.gov.uk/ukpga/1980/58/section/2/data.xml",
    title: "Limitation Act 1980: actions founded on tort",
    authority: "UK legislation",
    classification: "LEGISLATION",
    provision:
      "Section 2 sets a litigation limitation period, not a universal statutory pupil-file retention period",
    ...publicationUnknown,
    effective: currentText,
  }),
  englandSource({
    id: "eng-records-retention-guidance",
    url: "https://www.gov.uk/guidance/data-protection-in-schools/record-keeping-and-management",
    title: "DfE school record keeping and management",
    authority: "Department for Education",
    classification: "GUIDANCE",
    provision:
      "Category-specific retention schedules, review and disposal; distinguish guidance benchmarks from exact legislative obligations",
    publishedAt: "2023-02-03",
    publishedDateUnknownReason: null,
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Manual updated 14 October 2026; publication/update is not legal commencement and its mixed schedule does not establish every period as statutory.",
    },
  }),
  englandSource({
    id: "eng-records-access-guidance",
    url: "https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/individual-rights/right-of-access/education-information/",
    title: "ICO education information access",
    authority: "Information Commission",
    classification: "GUIDANCE",
    provision:
      "Separate pupil SAR and parental record rights; school holidays do not extend SAR time limits. Use current law for precise institution scope and amended deadlines.",
    ...publicationUnknown,
    effective: currentText,
  }),
];

export const recordsRouteRequirements: CatalogueRequirement[] = [
  englandRequirement({
    id: "eng-records-route-assessment",
    topic: "privacy_records",
    obligationClass: "RECOMMENDATION",
    condition: null,
    action:
      "Classify education and service records, identify their access, transfer and retention routes, and implement the applicable procedures and justified schedule.",
    applicabilityExplanation:
      "Assess actual records and controller/processor responsibilities across sectors. Pupil SARs differ from parental educational-record access: 2005 regulation 5 covers maintained schools excluding nurseries and non-maintained special schools, with inspection/copies within 15 school days of written request, lawful exclusions and at most supply-cost copying fees. It does not apply to every academy or independent school merely by label. Regulation 9 has a distinct maintained-school transfer route and exceptions. Curricular records in regulation 4 must be updated at least annually, not deleted after one year. For schools within the 2024 register rules, preserve entries six years from entry and required backups six years after their school-year end. DfE retention benchmarks and litigation limitation periods are not universal statutory 25th-birthday or 75-year rules. Keep GDPR deadlines, authority checks, exemptions and holds separate; holidays do not suspend SARs. Adult family relationships do not confer blanket access. Specialist regulated-care schedules and exemptions require separate review; no universal care-record period is prescribed here.",
    unknownExplanation:
      "Identify the actual legal institution/service, record category, requester authority and responsible role. Neither a product screen nor absent controller status resolves these routes. Unknown scope or unfinished required procedures prevents confirmation.",
    expectedEvidence: [
      "Record/institution/service and controller/processor classification; if no relevant records are processed, retain a supported absence assessment rather than silently assuming no duties.",
      "Category-to-source schedule with exact retention start events, statutory versus guidance rationale, holds and secure disposal; request routing, lawful exemptions and required transfer receipts without attaching live pupil/service-user records.",
      "Document unresolved specialist service rules and required remediation; a generic retention number or completed assessment with outstanding applicable actions is insufficient.",
    ],
    sourceIds: [
      "eng-records-parental-access",
      "eng-records-curricular",
      "eng-records-transfer",
      "eng-records-register-retention",
      "eng-records-education-exemptions",
      "eng-records-limitation",
      "eng-records-retention-guidance",
      "eng-records-access-guidance",
    ],
    signalKeys: [],
  }),
];
