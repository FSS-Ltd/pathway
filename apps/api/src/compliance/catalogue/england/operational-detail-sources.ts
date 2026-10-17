import { englandSource } from "./shared";

const observedCurrentText = {
  publishedAt: null,
  publishedDateUnknownReason:
    "Original publication day not independently established; current official text reviewed.",
  effective: {
    from: null,
    to: null,
    currentAsOf: "2026-10-15",
    unknownReason:
      "Current official text independently reviewed; original and amendment commencement dates are not all established.",
  },
};

export const operationalDetailSources = [
  englandSource({
    id: "eng-detail-asbestos",
    url: "https://www.legislation.gov.uk/uksi/2012/632/regulation/4",
    title: "Control of Asbestos Regulations 2012: regulation 4",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Dutyholder allocation; assessment and recorded reviews; conditional management plan and information duties",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-legionella",
    url: "https://www.hse.gov.uk/legionnaires/workplace-risks.htm",
    title: "Legionella risks in your workplace",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Employer/premises-controller responsibility; water-system risk assessment and proportionate control",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-electricity",
    url: "https://www.legislation.gov.uk/uksi/1989/635/regulation/4",
    title: "Electricity at Work Regulations 1989: regulation 4",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Safe construction, maintenance and work activities to prevent danger",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-pat",
    url: "https://www.hse.gov.uk/electricity/faq-portable-appliance-testing.htm",
    title: "Portable appliance testing: common questions",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Risk-based maintenance; no universal annual PAT, labelling or test-record requirement",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-gas",
    url: "https://www.hse.gov.uk/gas/employers.htm",
    title: "Gas safety for employers",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Relevant gas installations, safe maintenance, competent contractors and scope of GSIUR",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-coshh",
    url: "https://www.legislation.gov.uk/uksi/2002/2677/regulation/6",
    title:
      "Control of Substances Hazardous to Health Regulations 2002: regulation 6",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Assessment and implementation before exposure work; review and five-employee recording threshold",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-puwer",
    url: "https://www.hse.gov.uk/work-equipment-machinery/puwer.htm",
    title: "Provision and Use of Work Equipment Regulations 1998",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Equipment suitability, maintenance, inspection, training and related lifting-equipment regime",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-fostering-scope",
    url: "https://www.legislation.gov.uk/ukpga/1989/41/section/66",
    title: "Children Act 1989: private fostering definition",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Section 66: age, relationship, home accommodation, duration/intention and statutory exceptions",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-fostering-notice",
    url: "https://www.legislation.gov.uk/uksi/2005/1533/regulation/3",
    title:
      "Children (Private Arrangements for Fostering) Regulations 2005: regulation 3",
    authority: "UK Parliament",
    classification: "LEGISLATION",
    provision:
      "Different proposed-carer, arranger and parental notification duties and timings",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-adventure",
    url: "https://www.hse.gov.uk/aala/general-information.htm",
    title: "Adventure activities licensing scheme legislation",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Specified activities, payment, under-18 provision, licence and conditional exemptions",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-planning",
    url: "https://www.gov.uk/planning-permission-england-wales",
    title: "Planning permission: when you need it",
    authority: "Ministry of Housing, Communities and Local Government",
    classification: "GUIDANCE",
    provision:
      "New buildings, major changes, use changes and actual local planning authority decision",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-building",
    url: "https://www.gov.uk/building-regulations-approval",
    title: "Building regulations approval",
    authority: "Ministry of Housing, Communities and Local Government",
    classification: "GUIDANCE",
    provision:
      "Building/alteration approval, competent-person route and distinction from planning permission",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-licensing",
    url: "https://www.gov.uk/find-licences/premises-licence",
    title: "Premises licence",
    authority: "Home Office",
    classification: "GUIDANCE",
    provision:
      "Licensable venue activities, exemptions, council authorisation and licence conditions",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-gas-landlord",
    url: "https://www.hse.gov.uk/gas/landlords/safetycheckswhat.htm",
    title: "Landlord gas safety: what requires checking",
    authority: "Health and Safety Executive",
    classification: "GUIDANCE",
    provision:
      "Conditional landlord duties, appliance/pipework responsibility and annual-check scope",
    ...observedCurrentText,
  }),
  englandSource({
    id: "eng-detail-temporary-events",
    url: "https://www.gov.uk/find-licences/temporary-events-notice",
    title: "Temporary Events Notice",
    authority: "Home Office",
    classification: "GUIDANCE",
    provision:
      "Temporary-event route, eligibility, limits and council notification requirements",
    ...observedCurrentText,
  }),
];
