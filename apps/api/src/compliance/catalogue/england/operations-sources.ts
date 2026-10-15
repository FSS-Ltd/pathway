import type { TrackerCatalogue } from "../schema";
import { englandSource } from "./shared";

export const operationsSources: TrackerCatalogue["sources"] = [
  englandSource({
    id: "eng-op-risk",
    url: "https://www.legislation.gov.uk/uksi/1999/3242/regulation/3",
    title: "Management of Health and Safety at Work Regulations 1999",
    authority: "UK Parliament / Secretary of State",
    provision:
      "Regulations 1 and 3: employer assessment, review and five-employee recording threshold",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact publication day not established; enactment/made date is not publication",
    effective: {
      to: null,
      unknownReason: null,
      from: "1999-12-29",
    },
  }),
  englandSource({
    id: "eng-op-firstaid",
    url: "https://www.legislation.gov.uk/uksi/1981/917/regulation/3",
    title: "Health and Safety (First-Aid) Regulations 1981",
    authority: "UK Parliament / Secretary of State",
    provision:
      "Regulations 1, 3 and 4: adequate employee first-aid provision and information",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact publication day not established; enactment/made date is not publication",
    effective: {
      to: null,
      unknownReason: null,
      from: "1982-07-01",
    },
  }),
  englandSource({
    id: "eng-op-fire",
    url: "https://www.legislation.gov.uk/uksi/2005/1541/article/9",
    title: "Regulatory Reform (Fire Safety) Order 2005",
    authority: "UK Parliament / Secretary of State",
    provision:
      "Articles 1, 3, 5, 9 and 22; current article 9 recording amendments effective 1 October 2023",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact publication day not established; enactment/made date is not publication",
    effective: {
      to: null,
      unknownReason: null,
      from: "2006-10-01",
    },
  }),
  englandSource({
    id: "eng-op-equality",
    url: "https://www.legislation.gov.uk/ukpga/2010/15/section/85",
    title: "Equality Act 2010: school adjustments and accessibility",
    authority: "UK Parliament",
    provision:
      "Section 85(6)-(9), Schedule 10 paragraphs 3-6 and Schedule 13 paragraph 2; current revised text",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact publication day not established; enactment/made date is not publication",
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-op-foodreg",
    url: "https://www.gov.uk/guidance/food-business-registration",
    title: "Food business registration",
    authority: "Food Standards Agency",
    provision:
      "Who needs to register; food banks/charities; 28-day advance registration; childminder registration route",
    classification: "GUIDANCE",
    publishedAt: "2023-08-31",
    publishedDateUnknownReason: null,
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-op-foodsafe",
    url: "https://www.gov.uk/running-food-business",
    title: "Running a food business",
    authority: "Food Standards Agency / GOV.UK",
    provision:
      "Your responsibilities: safe food, food-safety system, staff instruction, allergens, supplier records and recall",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Undated current guidance; publication day not established",
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-op-foodcommunity",
    url: "https://www.gov.uk/government/publications/providing-food-at-community-and-charity-events/providing-food-at-community-and-charity-events",
    title: "Providing food at community and charity events",
    authority: "Food Standards Agency",
    provision:
      "Registration, allergens and food hygiene certificates; updated 4 September 2026",
    classification: "GUIDANCE",
    publishedAt: "2018-05-25",
    publishedDateUnknownReason: null,
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-op-visits",
    url: "https://www.gov.uk/government/publications/health-and-safety-on-educational-visits/health-and-safety-on-educational-visits",
    title: "Health and safety on educational visits",
    authority: "Department for Education",
    provision:
      "Types of trip; parental consent; outside organisations; adventure activities; emergency planning",
    classification: "GUIDANCE",
    publishedAt: "2018-11-26",
    publishedDateUnknownReason: null,
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-op-transport",
    url: "https://www.gov.uk/driving-a-minibus",
    title: "Driving a minibus",
    authority: "DVLA / GOV.UK",
    provision:
      "Licence conditions; hire or reward; permits and commercial operation; current guidance",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Undated current guidance; publication day not established",
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
  englandSource({
    id: "eng-op-boarding",
    url: "https://www.gov.uk/government/publications/boarding-schools-national-minimum-standards",
    title: "Boarding schools: national minimum standards",
    authority: "Department for Education",
    provision:
      "Current publication scope: maintained and independent boarding schools; separate residential-special-school standards; updated 18 May 2026",
    classification: "GUIDANCE",
    publishedAt: "2012-11-01",
    publishedDateUnknownReason: null,
    effective: {
      to: null,
      unknownReason:
        "Current applicable text independently reviewed; original legal/application commencement not established",
      currentAsOf: "2026-10-15",
      from: null,
    },
  }),
];
