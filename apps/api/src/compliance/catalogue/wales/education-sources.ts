import type { TrackerCatalogue } from "../schema";
import { walesSource } from "./shared";

const current = {
  from: null,
  to: null,
  currentAsOf: "2026-10-17",
  unknownReason:
    "Current official text verified; original commencement of each amended provision was not independently reconstructed.",
};
const guidance = {
  from: null,
  to: null,
  currentAsOf: "2026-10-17",
  unknownReason:
    "Current official guidance observed; this observation is not a legislative commencement date.",
};
export const educationSources: TrackerCatalogue["sources"] = [
  walesSource({
    id: "wal-iss",
    url: "https://www.legislation.gov.uk/wsi/2024/27/schedule/data.xml",
    title: "Independent School Standards (Wales) Regulations 2024",
    authority: "Welsh Ministers",
    provision:
      "Schedule paragraphs 2, 7–15, 23–24 and 29: education, welfare, checks, register and complaints",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Consolidated schedule contains provisions with different publication dates.",
    effective: current,
  }),
  walesSource({
    id: "wal-school-registration",
    url: "https://www.gov.wales/independent-schools-registration-and-operational-guidance-html",
    title: "Independent schools registration and operational guidance",
    authority: "Welsh Government",
    provision:
      "Parts 1–4: registration before admitting pupils, material changes, returns, standards and inspection",
    classification: "GUIDANCE",
    publishedAt: "2024-04-08",
    publishedDateUnknownReason: null,
    effective: guidance,
  }),
  walesSource({
    id: "wal-school-returns",
    url: "https://www.legislation.gov.uk/wsi/2024/26/contents/data.xml",
    title:
      "Independent Schools (Provision of Information) (Wales) Regulations 2024",
    authority: "Welsh Ministers",
    provision:
      "Regulations 4–7 and Schedule: initial and annual information returns",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Exact publication date of the statutory instrument was not independently verified.",
    effective: current,
  }),
  walesSource({
    id: "wal-safeguarding-guidance",
    url: "https://www.gov.wales/keeping-learners-safe",
    title: "Keeping learners safe",
    authority: "Welsh Government",
    provision:
      "2022 statutory guidance for local authorities, governing bodies and independent-school proprietors under Education Act 2002",
    classification: "GUIDANCE",
    publishedAt: "2016-12-16",
    publishedDateUnknownReason: null,
    effective: guidance,
  }),
  walesSource({
    id: "wal-community-safeguarding",
    url: "https://www.gov.wales/working-together-safeguard-people-code-safeguarding-practice",
    title: "Code of safeguarding practice",
    authority: "Welsh Government",
    provision:
      "2022 non-statutory safeguarding expectations for individuals, groups and organisations offering activities or services",
    classification: "GUIDANCE",
    publishedAt: "2022-01-11",
    publishedDateUnknownReason: null,
    effective: guidance,
  }),
  walesSource({
    id: "wal-childcare-exceptions",
    url: "https://www.gov.wales/registering-childcare-provider-exceptions",
    title: "Registering as a childcare provider: exceptions",
    authority: "Welsh Government",
    provision:
      "Current exemption and activity tests; school-incidental care and under-12 day-care classifications",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current page publication date not independently established.",
    effective: guidance,
  }),
  walesSource({
    id: "wal-childcare-standards",
    url: "https://www.gov.wales/national-minimum-standards-regulated-childcare-children-age-12-years-statutory-guidance",
    title: "National Minimum Standards for regulated childcare",
    authority: "Welsh Government",
    provision:
      "2026 statutory guidance for CIW-registered childcare for children up to 12; separate routes for open-access play",
    classification: "GUIDANCE",
    publishedAt: "2026-06-18",
    publishedDateUnknownReason: null,
    effective: guidance,
  }),
  walesSource({
    id: "wal-curriculum",
    url: "https://www.gov.wales/curriculum-wales-statutory-guidance",
    title: "Curriculum for Wales statutory guidance",
    authority: "Welsh Government",
    provision:
      "Maintained schools and funded non-maintained nursery education for ages 3–16; assessment and curriculum routes",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "The landing page combines sections updated on different dates.",
    effective: guidance,
  }),
  walesSource({
    id: "wal-aln",
    url: "https://www.gov.wales/additional-learning-needs-aln-decision-making-and-communication-html",
    title: "ALN decision making and communication",
    authority: "Welsh Government",
    provision:
      "2026 non-statutory IDP decision and communication guidance primarily for maintained schools and local authorities; not a universal duty for learning centres",
    classification: "GUIDANCE",
    publishedAt: "2026-03-27",
    publishedDateUnknownReason: null,
    effective: guidance,
  }),
  walesSource({
    id: "wal-dbs-current",
    url: "https://www.gov.uk/guidance/dbs-check-requests-guidance-for-employers",
    title: "DBS check requests: guidance for employers",
    authority: "Disclosure and Barring Service",
    provision:
      "Role-specific eligibility and certificate review; certificates have no generic expiry",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason: "Living guidance with multiple updates.",
    effective: guidance,
  }),
  walesSource({
    id: "wal-ewc",
    url: "https://www.gov.wales/independent-schools-registration-and-operational-guidance-html",
    title: "Independent school workforce registration guidance",
    authority: "Welsh Government",
    provision:
      "Part 4 paragraphs 236–240: Education Workforce Council registration and staff checks",
    classification: "GUIDANCE",
    publishedAt: "2024-04-08",
    publishedDateUnknownReason: null,
    effective: guidance,
  }),
];
