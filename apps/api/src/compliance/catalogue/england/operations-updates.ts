import type { CatalogueRequirement } from "../schema";
import { englandRequirement, englandSource } from "./shared";
export const operationsUpdateSources = [
  englandSource({
    id: "eng-op-residential-home-scope",
    url: "https://www.legislation.gov.uk/ukpga/2000/14/section/1/data.xml",
    title: "Care Standards Act 2000: children's-home definition",
    authority: "UK Parliament",
    provision:
      "Section 1, especially subsection (6): school accommodation, intention and actual two-year test",
    classification: "LEGISLATION",
    publishedAt: null,
    publishedDateUnknownReason:
      "Original publication day not independently established.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Current amended definition verified; original and amending commencements differ.",
    },
  }),
  englandSource({
    id: "eng-op-residential-special",
    url: "https://www.gov.uk/government/publications/residential-special-schools-national-minimum-standards",
    title: "Residential special schools: current national minimum standards",
    authority: "Department for Education",
    provision:
      "Current May 2026 standards with August 2026 correction restoring standard 23; distinct from ordinary boarding",
    classification: "GUIDANCE",
    publishedAt: "2012-11-01",
    publishedDateUnknownReason: null,
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Current corrected edition verified; publication history does not establish every standard's legal commencement.",
    },
  }),
  englandSource({
    id: "eng-op-passenger-permits",
    url: "https://www.gov.uk/government/publications/section-19-and-22-permits-not-for-profit-passenger-transport/section-19-and-22-permits-not-for-profit-passenger-transport",
    title: "Section 19 and 22 permits and obligations: passenger transport",
    authority: "Department for Transport",
    provision:
      "Permit eligibility, hire/reward, driver entitlements, safety, maintenance and actual operating obligations",
    classification: "GUIDANCE",
    publishedAt: null,
    publishedDateUnknownReason:
      "Current page update is 30 December 2020; initial publication day not independently established.",
    effective: {
      from: null,
      to: null,
      currentAsOf: "2026-10-15",
      unknownReason:
        "Current guidance reviewed; legal route and underlying provisions have different dates.",
    },
  }),
];
export const operationsUpdates: CatalogueRequirement[] = [
  englandRequirement({
    id: "eng-transport-review",
    action:
      "Document the operator, vehicle and service route; obtain the required licence/permit or supported exemption and verify drivers, insurance, roadworthiness and applicable hours rules.",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        {
          field: "transport",
          op: "eq",
          value: true,
        },
        {
          field: "operatesVehicles",
          op: "eq",
          value: true,
        },
      ],
    },
    applicabilityExplanation:
      "Assess hire/reward, commercial operation, passenger classes and actual vehicle/service facts. Section 19/22 eligibility is conditional; charity/religious status is not a blanket exemption. A permit does not waive driver entitlement or vehicle safety. Contracted transport requires provider checks, not the site obtaining its own permit.",
    unknownExplanation:
      "Record operator, seats, mass, propulsion, payment, licence and use. Do not demand the site obtains a permit for contracted transport. Seat-belt and international-operation duties remain specialist checks.",
    expectedEvidence: [
      "Operator/provider licence or permit decision and insurer confirmation",
      "Driver category, competence and applicable hours assessment; vehicle facts where directly operated",
      "Passenger safety and maintenance arrangements",
    ],
    sourceIds: ["eng-op-transport", "eng-op-passenger-permits"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-boarding-classification",
    action:
      "Establish the residential provision's legal route, obtain required registration/approval and implement its applicable boarding, residential-special-school or children's-home framework.",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: {
      field: "boarding",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "The boarding flag does not establish the legal route. Ordinary boarding and residential-special-school standards differ; use the current corrected special-school edition. Care Standards Act section 1(6) can classify a school as a children's home: more than 295 days, including intended accommodation and school-arranged stays, with a separate actual two-year limb and child-specific duration. Do not treat 295 itself as the threshold or wait for planned provision to occur. This row does not claim detailed children's-home quality standards have been reviewed.",
    unknownExplanation:
      "Obtain actual registration/category and current applicable standards; this classification action does not certify detailed boarding standards, children-home or private-fostering requirements.",
    expectedEvidence: [
      "Residential category, actual days/intention assessment and regulator registration/decision",
      "Applicable-standards matrix and completed remedial actions",
      "Responsible people and action plan",
    ],
    sourceIds: [
      "eng-op-boarding",
      "eng-op-residential-home-scope",
      "eng-op-residential-special",
    ],
    signalKeys: [],
  }),
].map((requirement) => ({
  ...requirement,
  version: 2,
  supersedesVersion: 1,
  effective: { from: "2026-10-17", to: null },
  materialChangeReason:
    "Expanded transport/residential classification, applicable route and implementation evidence require renewed manual confirmation.",
}));
