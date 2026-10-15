import type { CatalogueRequirement } from "../schema";
import { school } from "./conditions";
import { englandRequirement } from "./shared";
export { operationsSources } from "./operations-sources";

// Bounded national core: local permissions and specialist duties remain unresolved.
export const operationsRequirements: CatalogueRequirement[] = [
  englandRequirement({
    id: "eng-employer-risk",
    action:
      "Assess and control work risks to employees and others affected by the undertaking; review after significant change or suspected invalidity.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      field: "employsStaff",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Confirmed employer. Record significant findings and especially exposed employee groups when employing five or more; a written record below five is recommended.",
    unknownExplanation:
      "Confirm employment and headcount; volunteer-only organisations are not automatically employers. Self-employed and specialist activity duties require separate assessment.",
    expectedEvidence: [
      "Risk assessment and controls",
      "Headcount and recording decision",
      "Review triggers and responsible people",
    ],
    sourceIds: ["eng-op-risk"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-employer-firstaid",
    action:
      "Provide adequate and appropriate employee first-aid equipment, facilities and cover, and inform employees of the arrangements.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      field: "employsStaff",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Confirmed employer; provision follows assessed circumstances, not a universal first-aider ratio. An appointed person can suffice where regulation 3 permits.",
    unknownExplanation:
      "Confirm actual employees and needs. This employee duty does not replace school/EYFS duties for children.",
    expectedEvidence: [
      "Needs assessment",
      "Cover, equipment and competence records",
      "Employee information",
    ],
    sourceIds: ["eng-op-firstaid"],
    signalKeys: ["medical"],
  }),
  englandRequirement({
    id: "eng-fire-responsibility",
    action:
      "Identify the responsible persons and extent of fire duties, coordinate shared-premises arrangements and check current assessment and precautions.",
    topic: "premises_safety",
    obligationClass: "RECOMMENDATION",
    condition: {
      any: [
        {
          field: "controlsPremises",
          op: "eq",
          value: true,
        },
        {
          field: "employsStaff",
          op: "eq",
          value: true,
        },
      ],
    },
    applicabilityExplanation:
      "Employment or premises control prompts classification. Neither flag alone identifies every responsible person or extent of statutory duties. Confirmed responsible persons must record assessment/review findings regardless of employee count under current article 9.",
    unknownExplanation:
      "Obtain lease, use and control facts; clarify shared roles with landlord/other occupiers and competent fire advice. This review does not certify planning, building control or specialist fire regimes.",
    expectedEvidence: [
      "Responsibility and control matrix",
      "Recorded assessment, precautions and review",
      "Shared evacuation and cooperation arrangements",
    ],
    sourceIds: ["eng-op-fire"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-school-accessibility",
    action:
      "Implement reasonable adjustments for disabled pupils and a written accessibility plan covering curriculum, physical environment and accessible information.",
    topic: "premises_safety",
    obligationClass: "STATUTORY_DUTY",
    condition: school,
    applicabilityExplanation:
      "Applies to the responsible body of an actual school. School pupil adjustments concern practices and auxiliary aids; physical improvements are addressed through accessibility planning, not the ordinary physical-feature adjustment requirement.",
    unknownExplanation:
      "Confirm school category and responsible body. Non-school services/associations and employee adjustments require their own equality-law assessment.",
    expectedEvidence: [
      "Adjustment decisions and implementation",
      "Resourced accessibility plan",
      "Review and accessible information arrangements",
    ],
    sourceIds: ["eng-op-equality"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-food-classification",
    action:
      "Confirm the food operation and registration route with local environmental health and use safe handling arrangements.",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: {
      field: "food",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Supplying food prompts classification, including free supply. Limited infrequent events may not need registration; no blanket food-hygiene-certificate requirement.",
    unknownExplanation:
      "Confirm frequency, operator and council decision. A food flag alone does not establish a food business or allergen-labelling duties.",
    expectedEvidence: [
      "Activity and frequency record",
      "Council classification or registration route",
      "Safe handling and ingredient information",
    ],
    sourceIds: ["eng-op-foodcommunity", "eng-op-foodreg"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-food-registration",
    action:
      "Complete the applicable local-authority food-business registration route at least 28 days before starting and retain site registration evidence.",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      field: "foodBusiness",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Confirmed food business, including qualifying regular free supply. Each site needs the applicable route; registered childminders may be registered through Ofsted/agency information rather than a duplicate application.",
    unknownExplanation:
      "Confirm operator, sites and registration/approval route with the council; specialist food approval is not established by this checklist.",
    expectedEvidence: [
      "Site registration confirmation",
      "Start date and council correspondence",
    ],
    sourceIds: ["eng-op-foodreg"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-food-safety",
    action:
      "Operate food-safety controls, staff instruction, allergen information, traceability and unsafe-food withdrawal or recall arrangements.",
    topic: "activities",
    obligationClass: "STATUTORY_DUTY",
    condition: {
      field: "foodBusiness",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "Confirmed food business. Controls must match its food and handling operations; loose food, prepacked and PPDS information rules differ. Hygiene-rating display is voluntary in England.",
    unknownExplanation:
      "Record actual food/packaging processes and applicable requirements; no universal certificate or identical labelling format is inferred.",
    expectedEvidence: [
      "Food-safety system and monitoring",
      "Staff instruction and hygiene records",
      "Allergen, supplier and recall records",
    ],
    sourceIds: ["eng-op-foodsafe", "eng-op-foodcommunity"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-school-visits",
    action:
      "Plan school visits proportionately, check outside providers, establish emergency arrangements and determine applicable parental consent.",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: {
      all: [
        school,
        {
          field: "trips",
          op: "eq",
          value: true,
        },
      ],
    },
    applicabilityExplanation:
      "DfE non-statutory school guidance. Routine visits can use existing arrangements. Nursery-age children need written consent; most older pupils curriculum trips do not need separate written consent.",
    unknownExplanation:
      "Confirm ages, hours, activity and risk level; higher-risk/out-of-hours trips differ. Adventure licensing and overseas rules need specialist review.",
    expectedEvidence: [
      "Visit plan, supervision and provider checks",
      "Consent decision and parent information",
      "Emergency contacts and review",
    ],
    sourceIds: ["eng-op-visits"],
    signalKeys: ["trips"],
  }),
  englandRequirement({
    id: "eng-transport-review",
    action:
      "Establish transport responsibilities and check operator, driver entitlement, vehicle suitability and passenger safety before use.",
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
      "Transport may be contracted or operated directly. Charity/religious status does not create a blanket permit exemption; car-licence minibus conditions depend on actual driver and vehicle facts.",
    unknownExplanation:
      "Record operator, seats, mass, propulsion, payment, licence and use. Do not demand the site obtains a permit for contracted transport. Seat-belt and international-operation duties remain specialist checks.",
    expectedEvidence: [
      "Operator/provider and insurance checks",
      "Driver entitlement and vehicle facts where directly operated",
      "Passenger safety and maintenance arrangements",
    ],
    sourceIds: ["eng-op-transport"],
    signalKeys: [],
  }),
  englandRequirement({
    id: "eng-boarding-classification",
    action:
      "Confirm the residential provision category and review its current welfare, accommodation, health, staffing and emergency standards.",
    topic: "activities",
    obligationClass: "RECOMMENDATION",
    condition: {
      field: "boarding",
      op: "eq",
      value: true,
    },
    applicabilityExplanation:
      "The boarding flag does not distinguish ordinary boarding schools, residential special schools or non-school accommodation. The DfE publication identifies different standards for residential special schools.",
    unknownExplanation:
      "Obtain actual registration/category and current applicable standards; this classification action does not certify detailed boarding standards, children-home or private-fostering requirements.",
    expectedEvidence: [
      "Residential category and regulator decision",
      "Applicable standards and gap assessment",
      "Responsible people and action plan",
    ],
    sourceIds: ["eng-op-boarding"],
    signalKeys: [],
  }),
];
