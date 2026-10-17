import { englandSource } from "./shared";

const currentText = {
  publishedAt: null,
  publishedDateUnknownReason:
    "Original publication day not independently established; current official text reviewed.",
  effective: {
    from: null,
    to: null,
    currentAsOf: "2026-10-15",
    unknownReason:
      "Current consolidated provision reviewed; original and amendment commencement dates are not all established.",
  },
};

export const commonOperationsSources = [
  englandSource({
    id: "eng-common-riddor-responsibility",
    url: "https://www.legislation.gov.uk/uksi/2013/1471/regulation/3",
    title: "RIDDOR: responsible persons",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Regulation 3: employer and premises/undertaking responsibility, with specialist branches",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-riddor-worker",
    url: "https://www.legislation.gov.uk/uksi/2013/1471/regulation/4",
    title: "RIDDOR: worker injuries",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Specified work-related injuries; over-seven-day incapacity; reporting timing and exceptions",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-riddor-nonworker",
    url: "https://www.legislation.gov.uk/uksi/2013/1471/regulation/5",
    title: "RIDDOR: non-worker injuries",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Work-related accident and site-to-hospital treatment criteria; hospital-premises limb; exceptions",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-riddor-records",
    url: "https://www.legislation.gov.uk/uksi/2013/1471/regulation/12",
    title: "RIDDOR: records",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Reportable events and over-three-day incapacity records; at least three years from entry",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-adjustments",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/section/20",
    title: "Equality Act: reasonable adjustments",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Applicable duty and Schedule; practices, physical features, auxiliary aids and accessible information",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-services",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/section/29",
    title: "Equality Act: services and public functions",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Paid/free public services, public functions and applicable discrimination/adjustment duties",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-boundaries",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/section/28",
    title: "Equality Act: Part 3 scope",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Education/work/premises overlap and protected-characteristic limitations",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-schools",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/section/85",
    title: "Equality Act: school pupils",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Actual responsible school bodies; admissions, provision and adjustment duties",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-education-adjustments",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/schedule/13",
    title: "Equality Act: education adjustments",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Paragraph 2: school practice/auxiliary-aid duties exclude physical-feature branch; other education routes differ",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-associations",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/section/107",
    title: "Equality Act: association scope",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "At least 25 members and regulated selection; Schedule 15 adjustment provisions",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-riddor-types",
    url: "https://www.hse.gov.uk/riddor/reportable-incidents.htm",
    title: "RIDDOR reportable incidents",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Event categories, qualifying occupational disease/exposure, dangerous occurrences and exceptions",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-riddor-timing",
    url: "https://www.hse.gov.uk/riddor/when-do-i-report.htm",
    title: "When to report a RIDDOR incident",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Without-delay notification and ten-day reports; fifteen-day incapacity route; disease diagnosis route",
    ...currentText,
  }),
  englandSource({
    id: "eng-common-equality-code",
    url: "https://www.equalityhumanrights.com/guidance/codes-practice/code-practice-services-public-functions-and-associations/chapter-seven",
    title: "Equality Code: reasonable adjustments",
    authority: "Equality and Human Rights Commission",
    classification: "GUIDANCE",
    provision:
      "Chapter 7: anticipatory, continuing and context-dependent adjustments; services/public functions/associations",
    ...currentText,
    publishedAt: "2026-08-05",
    publishedDateUnknownReason: null,
  }),
];
